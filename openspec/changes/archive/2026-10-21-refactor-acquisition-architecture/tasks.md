# Tasks

本变更是纯重构，`specs` 已通过 `skip_specs: true` 刻意跳过；以下任务均未实施。行为基线为现有 `native-acquisition`、`android-passive-capture`，目标归属与资源规则见 `design.md`。

## 1. 共通路径与基础文件能力

- [x] 1.1 实现 `AcquisitionPaths`，集中注入根目录并保留 PPG／视频原目录、文件名和会话标识约束；用临时目录实际创建两类会话路径，验证已有文件位置不变且不同会话隔离。
- [x] 1.2 实现仅供当前消费者所需的 `AcquisitionFileStore` 建目录、新建拒覆盖输出、单文件提升，区分 CSV 新输出与视频预分配路径；用文件行为测试验证拒覆盖保留原内容、失败不交付完成路径及会话隔离，不包装或测试 File 的全部方法。
- [x] 1.3 在路径／文件临时目录 smoke 通过后，更新 `docs/architecture/code-organization.md` 的存储职责和已有目录兼容说明；核对说明与 1.1 实际创建的路径一致，不添加迁移或自动删除承诺。

## 2. 泛型 CSV 与双文件输出

- [x] 2.1 实现 `BatchWriter<T>`／所需泛型工厂、`CsvRowEncoder<T>`、接管输出流的 `CsvBatchWriter<T>`，合并两个 writer 的公共部分；用行为测试验证跨批顺序、表头失败释放流、幂等关闭及关闭后拒写，确认不持有批次视图或按条创建任务。
- [x] 2.2 提取 `PPGCsvEncoder`、`FrameCsvEncoder` 并直接编码同一配对记录；迁移现有 CSV 测试，验证完整旧表头、毫秒小数、相机纳秒字段和缺失字段含义，实际读出两份 CSV 确认协议未变。
- [x] 2.3 实现 `PPGSessionOutput` 管理双 writer 的打开、顺序消费、关闭、提升和回退；用故障注入验证第二侧打开／写入／关闭／提升失败都不返回成功产物，并仍回收其它已打开句柄、保留原始原因。
- [x] 2.4 删除被替代的 writer、两套专用 BatchWriter／Factory 与旧导入，切换生产调用方和测试替身，不留别名／转发壳；以相关输出／会话行为测试和实际双文件 smoke 验证，随后更新 `docs/acquisition/android-ppg.md`、`docs/architecture/technology-stack.md` 的编码与输出职责。

## 3. PPG 模型、帧路径与会话

- [x] 3.1 按设计迁移相机适配、拍摄结果、像素工具、处理器、关联器和产物，统一 `PPGRecord`／`PPGRecordProcessor`／`PPGCaptureRecord` 等类型与文件名；迁移调用方及测试，验证旧 CSV 内容、乱序精确配对、缺失／重复时间戳失败与隔离行为保持。
- [x] 3.2 将 `CaptureSession` 拆为 `PPGCaptureSession` 与已实现的输出依赖，移除会话内路径拼接／句柄／提升代码，保留单 DataHub 和既有锁／屏障；用阻塞 writer 和在途帧测试验证 stop 等待两侧尾批、重复 stop 同结果、容量／处理失败不交付产物。
- [x] 3.3 从旧运行类拆出 `PPGFrameHandler`，保持同步像素借用、开始边界和回调绑定；用处理成功／失败及旧回调测试验证帧恰好释放一次、失效后不可访问、预览记录不混入正式文件，不引入第二套活动会话状态。
- [x] 3.4 将控制命令与预览归入 `PPGController`／`PPGRuntime`，保留预览 metadata 缓存、低频提示和现有错误类别；实际运行打开预览、开始、停止、关闭及界面卸载路径，读取双 CSV 验证对应行序与 timestampFrame，随后更新 PPG 文档与架构归属。

## 4. 被动能力与相机共享边界

- [x] 4.1 将唯一 `CameraUseGuard`／租约迁入 `camera/ownership/` 并迁移主动／被动调用；保留相机占用行为测试，实际验证忙时拒绝或跳过且不抢占已有会话。
- [x] 4.2 按设计归类被动 runtime／service／trigger／capture，迁移所有 Intent、通知动作、Manifest 服务全名及测试引用；运行周期门控与取消／Finalize 竞争测试，并真实启停前台服务确认注册路径可用。
- [x] 4.3 使 `PassiveVideoArtifactStore` 依赖共通路径与文件操作，保留媒体检查、取消片段处理和现有目录扫描；用发布／取消／拒覆盖测试及真实已完成视频查询验证原路径和已完成文件保留。
- [x] 4.4 在被动服务与文件 smoke 后，更新 `docs/acquisition/android-passive-capture.md`、架构文档及受包名迁移影响的 `docs/development/android-development.md` 命令；不改写历史设备验收结论或要求其替代本次回归。

## 5. TypeScript 内部组织与 Nitro 接入

- [x] 5.1 将客户端实现迁入 `src/ppg/client.ts`、`src/passive/client.ts` 并同步相对导入及根导出，移除旧文件，不改公开类／函数／类型和 `/react` 入口；运行 acquisition 与 native 应用的 pnpm typecheck，验证现有应用调用方无需切换 API。
- [x] 5.2 更新手写 Hybrid 的内部委派与预览引用，保留 Nitro Spec／对象注册名／Hybrid namespace，不手改生成物；构建 Android development build 并实际打开原生预览和被动状态页，确认绑定与委派工作。
- [x] 5.3 核对 `docs/architecture/code-organization.md` 的完整目标归属与依赖方向，修正当前文档中的旧实现名但不改写归档记录；以包根导入 smoke、已执行的 UI 行为和文档路径交叉核对，不用源码扫描测试固定目录结构。

## 6. 跨模块最终回归

- [x] 6.1 对本次影响的原生行为测试执行完整回归并完成相关类型检查和 Android 构建，记录实际命令与结果；任何现有行为失败都需定位修复，不以移除行为断言或重写期望掩盖。
- [x] 6.2 实际完成至少两次主动采集，读取双 CSV 核对表头、逐帧对应、独立路径与关闭后仍可读；检查停止收尾期间不能交叠新会话，并记录模拟器／实机输入边界。
- [x] 6.3 实际回归被动真实解锁录像、等待释放相机、通知关闭、原目录完成视频重查及主动／被动互斥；区分本次重构回归与原产品长待机证据，不冒称重做或替代全部实体设备验收。
- [x] 6.4 将最终运行证据补入对应 `docs/development/android-development.md`／采集文档，确认没有旧生产别名、空传感器模块、未迁移调用方、协议变化或已完成文件删除；此变更在不实施传感器的情况下可以独立交付。
