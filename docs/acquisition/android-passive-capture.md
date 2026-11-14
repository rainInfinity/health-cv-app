# Android 无扰式被动采集协议

## 启用、权限与服务

只有用户明确启用并满足相机、通知条件后，Android 前台服务才等待新的真实解锁机会。进入页面、读取快照、保存配置或收到深链都不会启用服务；离页只解除 UI 订阅，不停止服务。拒绝相机、拒绝通知或关闭通知渠道分别报告 `CAMERA_PERMISSION_DENIED`、`NOTIFICATION_PERMISSION_DENIED`、`NOTIFICATION_CHANNEL_DISABLED`，不会启动服务或打开相机。系统未在限定时间确认服务启动时报告 `FOREGROUND_SERVICE_START_TIMEOUT`，不假报运行中。

厂商后台设置与 Android 运行时权限分开，应用不能通用地读取或授予。启用按钮提供后台设置引导，用户确认已设置或不适用后才继续授权。Honor 的“允许后台活动”等设置需用户手动管理，不能据此保证其他机型的后台相机行为。

状态依次如实报告 `disabled`、`starting`、`waiting`、`observing`、`measuring`、`stopping` 和 `failed`。持续通知使用静默渠道，提供“关闭无扰采集”操作；服务关闭、系统停止或进程重启后不会自动恢复，需用户重新启用。

## 解锁机会与周期

真实 `USER_PRESENT` 只提供启动候选：服务已启用、权限和通知条件有效、周期满足、没有正在处理的机会且相机可用时才启动。仅唤醒屏幕、周期自然到期、观察超时或相机忙都不会启动、排队或重试。

`intervalSeconds` 是两次机会首帧之间的最短周期，默认 7,200 秒。每次机会首帧回调时记录 `SystemClock.elapsedRealtimeNanos()` 作为周期锚点；首帧前失败不占周期，交付首帧后即使无人脸或随后中断仍占周期。墙上时钟变化不影响周期。

`PassiveCaptureConfig.measurementDurationSeconds` 是人脸就绪后的正式测量时长，默认 30 秒。旧 `duration_millis` 偏好中的合法值原样换算为秒；读取旧设置不启用服务或打开相机。非法周期／时长由原生返回稳定错误码和说明，保存值不被静默修改。完整频谱首窗的理想连续输入条件约需 15.5 秒，页面通过 `minimumHeartRateMeasurementSeconds` 提示不足时长；较短会话可能得到逐搏初步值，也可能始终无合格结果。6–10 秒仅为首结果体验目标，不是保证。

## 共用内核与独立生命周期

服务在自身生命周期下创建共用 `RPPGSession`，复用主动 RPPG 的算法与结果存储，各会话的状态、配置、算法实例和相机租约独立。CameraX 仅绑定 `ImageAnalysis`，不创建 `Preview`、隐藏 `Surface`、视频临时文件或 JavaScript 实时波形订阅；不录音、不自动上传。

会话启动时开始有界观察计时，默认上限 5 秒，包含相机绑定时间。连续满足共用就绪条件后才开始正式计时；观察帧不回填。正式目标从就绪状态转换的单调时刻起算；丢脸或 ROI 失效时不复用旧颜色样本，按共用算法切段，但不延长截止时刻。

等待期间相机关闭；主动 PPG、主动 RPPG 和被动会话通过相机租约互斥，占用时返回 `CAMERA_BUSY`，不抢占或改用另一镜头。传感器独立采集，不因被动服务的启停而停止。被动服务不依赖 React 页面、主动 runtime 或波形订阅，应用切到后台不等同于关闭服务，实际可执行性仍受 Android 与厂商策略约束。

服务通过低频 `PassiveCaptureSnapshot.latestInstantHeartRate` 提供共用逐搏估计器的合格结果或失效清空，不逐搏刷新通知。切段、过期、锁屏／关闭、会话结束和新会话边界不沿用旧值，旧代次不能污染当前会话。逐搏值不计入频谱平均或最终频谱结论，不新增 CSV；算法及风险见 [RPPG 逐搏瞬时心率](android-rppg.md#逐搏瞬时心率)。

## 终止与结果查询

RPPG 文件路径、字段、时间精度、完整发布条件及全部合法终止原因统一见 [RPPG 文件 schema 与完整发布](android-rppg.md#文件-schema-与完整发布)，不在此重复定义。

- 观察期收到过相机帧但未就绪：可发布 `termination=observation_timeout`、`signalStatus=no_waveform` 的完整结果，CSV 只有表头。
- 观察期没有任何相机帧：以 `NO_CAMERA_FRAMES` 失败，不发布空成功结果。
- 首帧后锁屏、关闭服务等合法生命周期中断：可发布 `source=passive`、`termination=interrupted` 的完整结果，信号结论按实际样本记录。
- 算法、输出初始化、写入或收尾等技术失败：不发布完成产物，临时或不完整目录不可查询。

`PassiveCaptureClient` 提供服务快照、通知设置、启停和配置保存；`listArtifacts()` 只返回共用 `RPPGArtifact` 三件套，包含来源、终止原因、信号结论、样本计数及文件引用。被动来源为 `passive`，不另建波形类型。

`listVideoArtifacts()` 独立查询升级前已完成且可读的 `PassiveVideoArtifact`，保留真实宽高、时长、大小和 `files/passive-capture/<sessionId>/video.mp4` 路径。旧视频仅供历史查询，不重编码、不删除、不转换为 RPPG，也不再生成新录像；两类产物均为应用私有文件，不自动上传或清理。

公共路径和原子文件操作由 `AcquisitionPaths`／`AcquisitionFileStore` 维护；历史视频的媒体轨检查与扫描由 `PassiveVideoArtifactStore` 负责。新会话由共用 `RPPGSession`／`RPPGArtifactStore` 持有相机并发布三件套，不经过旧视频 `Finalize` 路径。

## 操作与真机边界

入口、真实解锁输入和文件核查见 [Android 开发手册](../development/android-development.md)。真机需记录机型／厂商、Android 与 API、应用版本及 target SDK、权限／通知渠道和后台设置，并分别检查：

1. 短周期真实解锁、页面外运行、周期内重复解锁抑制，以及周期到期但没有解锁时不启动。
2. 默认 7,200 秒实际等待后的解锁机会；短周期不能替代两小时等待。
3. 观察／测量中锁屏、等待／测量中通知关闭、系统停止及进程重启后的相机释放、不自动恢复和完整结果查询。
4. 三件套的来源、终止原因、信号结论及样本计数；历史视频不增加、不被替换。
5. 实际信号质量、逐搏初步值与频谱结果的区别，以及独立参考仪器的时间对齐与误差。

模拟器素材不代表人体信号；厂商后台兼容、长期等待、颜色／性能和心率准确性仍需真机验证，不能由文件存在或初步 bpm 推导医学有效性。
