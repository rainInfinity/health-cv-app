# 代码组织与模块边界

本文维护模块职责、依赖方向和源码归属；选型见[技术选型](technology-stack.md)，具体开发规则见[前端开发约定](../development/frontend-development.md)。CV 指心血管（cardiovascular）。

## 当前目录

```text
apps/native/
├── src/app/          # 启动、导航、认证、查询、偏好及原生能力组装
├── src/pages/        # home、features、history、user、measurement、dev 页面
├── src/shared/       # 已复用组件、图形和主题
├── assets/           # 品牌与操作图片
├── plugins/          # Expo 宿主配置插件
└── app.json          # CNG 应用配置
packages/
├── acquisition/      # Android 原生采集及 TypeScript 客户端
└── cloud-client/     # 普通渠道 HTTP 与文件接口
```

`packages/measurement` 是尚未实施的业务包目标，不属于当前目录。现有页面测量接入位于 `apps/native/src/app/measurement`、`app/rppg` 与 `pages/measurement`，尚未形成采集后上传云端的完整业务编排。

使用 pnpm workspace；不预建 WeApp、中央 `contracts`、独立状态包、跨端 UI 包或没有使用方的公共模块。组件目录、`@/` 别名和样式组织遵守前端开发约定，不在此重复维护。

## 应用端：`apps/native`

### `src/app`：组装与应用状态

| 模块 | 职责 |
| --- | --- |
| `bootstrap.ts`、`runtime-config.ts`、`providers/` | 读取显式服务配置，组装云端客户端、认证、QueryClient、主题和统一反馈；缺少云端配置不阻止独立本地采集。 |
| `navigation/`、`startup/` | 根栈、产品 Tab、开发子栈、静态开屏、两步引导、深链与相机离页守卫。 |
| `auth/`、`query/` | 认证恢复、刷新与退出，受保护查询及按会话隔离的缓存；页面挂载不是恢复前提。 |
| `i18n/`、`preferences/`、`storage/` | 文案与格式化、小型非敏感偏好及 MMKV 存储引擎；注册引擎后再创建持久化 Store。当前产品固定简体中文。 |
| `acquisition.ts`、`sensors.ts`、`passive-capture.ts` | 原生客户端与低频状态组装，不缓存完整采样或接管原生生命周期。 |
| `measurement/`、`rppg/` | 测量入口与操作图片映射、指尖／血压配置与启动适配、共用频谱摘要和有限波形缓存；不自动上传、不产生健康历史。 |

认证令牌由 `expo-secure-store` 按规范化服务地址与渠道隔离保存，普通 Store 不保存密码或令牌。认证状态与凭据、刷新、退出及缓存隔离的详细合同见[认证会话](../development/native-auth-session.md)。

### `src/pages`：用户界面

- `home`：首页、开屏、首次引导与指标详情；`features`：按部位／指标选择入口。
- `measurement`：准备、声音确认、真实面部 RPPG、后摄指尖和血压采集展示。指尖覆盖、正式窗口和脉搏处理，以及血压覆盖／IMU准入、共同窗口与组内收尾归原生；页面计时和图形不能替代原生截止、结果有效性或文件收尾，血压不展示波形或血压估值。
- `user`：真实认证、权限和语言说明；`history`：未开放状态，不伪造历史数据。
- `dev`：主动 PPG、主动 RPPG、被动采集、传感器及反馈等工程操作入口，不代表正式产品结果。

页面负责组合、交互入口与展示；Hook 负责订阅、展示映射和局部状态。不在页面直接调用 Axios、读写采集文件或串联上传与云端处理，也不增加只有转发作用的 Hook／桥接层。

相机离页守卫等待在途命令、关闭和文件收尾；关闭失败时保留错误处理入口，不提前交接相机。被动服务离页只解除页面订阅，独立传感器切页也不因此停止；进入后台的边界由各原生运行时负责。

### `src/shared` 与宿主工程

实际跨功能复用的组件才提升到 `shared/components`；主题在 `shared/theme`，通用及业务图形在 `shared/graphics`。模块私有工具留在所属模块，不建立包罗文件、网络和设备的 `shared/services`。

Expo Prebuild / CNG 生成宿主工程。权限、应用标识和宿主定制维护在应用配置及 config plugin；采集主体源码留在功能包，不依赖生成目录里的孤立手工修改。

## 设备采集：`packages/acquisition`

| 公开能力 | 所有权与数据边界 | 详细说明 |
| --- | --- | --- |
| `AcquisitionClient` | 相机 PPG 的查询、冻结配置、预览、手动采集与双 CSV；指尖另有覆盖门控和有界展示脉搏；显式血压轮次具有覆盖／IMU联合准入、PPG＋ACC共同接收窗口及低频组合结果，无原始逐帧／IMU JS接口。 | [PPG 协议](../acquisition/android-ppg.md) |
| `RPPGClient` | 主动前摄预览与显式测量；低频状态／心率、有界标量波形及三件套产物。 | [RPPG 协议](../acquisition/android-rppg.md) |
| `PassiveCaptureClient` | 服务启停、独立配置和解锁机会；查询被动 RPPG 结果与独立的旧视频。 | [被动采集](../acquisition/android-passive-capture.md) |
| `SensorClient` | 按类型独立控制、状态与 CSV 引用；不向 JS 发送样本。 | [传感器协议](../acquisition/android-sensors.md) |

### 原生实现归属

源码位于 `packages/acquisition/android`，Nitro Spec 位于 `src/native`；React 视图通过独立的 `acquisition/react` 入口提供，控制客户端不依赖 React 组件。

| 原生目录 | 职责 |
| --- | --- |
| `camera/`、`camera/ownership/` | 相机能力与配置、CameraX 帧源、帧代次和互斥租约。 |
| `pixels/` | 同帧只读像素借用及 YUV plane／stride 读取，不包含人脸或信号算法。 |
| `ppg/` | 网格统计、Camera2 元数据精确配对、相机会话与双 CSV 输出；`fingertip/`拥有单源覆盖门控及展示脉搏，`bloodpressure/`拥有双阶段轮次、组内协调与结果，`bloodpressure/imu/`拥有有界姿态／稳定／持续心震工程判定。 |
| `rppg/` | 模型、ROI、在线信号、会话、完整结果存储和有限实时展示。 |
| `passive/` | 前台服务、真实解锁触发、首帧周期门控与独立运行状态。 |
| `sensors/` | SensorManager 适配、按源所有权、观测与正式窗口分离、回调屏障及原始 CSV；为血压提供真实同源ACC与gyro观测，不接管血压准入决策。 |
| `pipeline/`、`storage/` | 按流／会话实例化的有界 DataHub、集中路径及拒覆盖文件操作；具体完整发布策略归各自产物存储。 |
| `bridge/` | Nitro 对象与各自控制器连接，不混合会话所有权。 |

主动与被动 RPPG 共用 `RPPGSession`、处理器和 `RPPGArtifactStore`，每次会话仍拥有独立配置、队列与输出。主动 runtime 管预览与显式测量；被动服务只绑定 `ImageAnalysis`，不预览、不录像、不订阅 JS 波形。升级前视频仅保留独立查询，不转成 RPPG 结果。

主动 PPG、主动 RPPG、被动 RPPG 通过 `CameraUseGuard` 拒绝抢占和相机并发；互斥不代表主动采集可以后台运行，也不承诺 OEM 允许后台相机。传感器默认按类型独立，某一源失败不级联停止其他源；唯一协调例外是用户显式发起的血压轮次，只取得并结束自己持有的相机、ACC与gyro，不抢占或停止组外来源。共同宿主进入后台可中断全部前台传感器。

### 高频数据与产物

相机帧、像素、关键点、完整信号、传感器样本和连续文件写入留在原生。JS 只持有控制结果、低频状态、错误和文件引用；主动 RPPG 与指尖的有限标量波形是明确的窄例外，不替代完整记录存储。指尖原始 PPG 与展示脉搏同源分流，不读取 CSV 冒充实时流；本轮展示历史归页面局部，离页释放，不新增波形文件。血压不生成展示波形，只提供可空姿态／稳定性／心震工程候选；未经人体校准的参数不意味着胸口接触或医学质量已被验证。

停止采集、释放资源和删除产物是不同操作。正常停止先完成在途处理、队列排空和文件发布；技术失败不得伪装为成功文件。页面不直接读写或删除会话文件，不因上传成功隐式清理。

PPG 与传感器产物列表仅保留当前进程完成引用；RPPG 与旧视频分别扫描其完整结果目录。路径、发布条件、时钟语义和失败规则以对应采集协议为准，不在架构文档复制字段表。血压共同半开窗口仅限定原生接收上下界，PPG／ACC保留各自原始时标，不构成硬件同步或精确曝光／事件对齐；各源独立完成文件，不引入跨源共享事务，也不用历史产物补全当前轮次。旧经验提示、指尖空间覆盖估计及医学质量是不同概念，覆盖百分比不表示精确物理面积或医学有效性。

## 云端通信：`packages/cloud-client`

该包拥有普通渠道认证、本人账号／资料、模型目录、任务和文件的 HTTP 合同；每个资源方法执行一个请求。DTO 由包根 `Req`、`Rsp` 命名空间导出，业务 DTO 不另行复制或递归改名。

Axios 负责传输、超时、取消、成功封套解包和结构化错误；不刷新令牌、不重试、不轮询，不编排创建／上传／提交。下载返回二进制载荷及可取得的响应头，不负责落盘。详细合同见[云端请求接口](../development/cloud-client-api.md)，尚未确认的采集输入映射见[上传对接草案](../development/acquisition-upload-protocol.md)。

应用认证状态、React Query、Nano Stores 和页面反馈不进入通信包；完整信号也不进入查询缓存。

## 目标业务包与依赖方向

未来的 `measurement` 包拟统一拥有测量方案、业务会话、业务状态及结果映射：根据真实采集和服务端结果推进流程，区分采集完成、文件完成、上传完成与云端成功；不依赖 React、设备实现或 Axios，也不预建通用流程引擎。

当前与目标边界均遵守：

- 应用组装层使用采集与云端包；未来业务包接收必要接口，不反向依赖应用。
- `acquisition` 与 `cloud-client` 互不管理生命周期，不依赖未来业务包。
- 包间只用公开入口，不从其他包 `src` 深层导入；类型跟随概念所有者，不建立中央类型仓库。
- 只因实际复用、发布或构建需求拆包，不按代码量提前拆 `domain/state/data/contracts`。

## 文档职责

[文档索引](../README.md)维护阅读入口；架构写职责，选型写决策，采集写协议，开发写操作和使用约定，产品写目标与开放条件。OpenSpec 保留规格与变更流程，不代替这些长期说明。历史验收记录不在本目录维护。
