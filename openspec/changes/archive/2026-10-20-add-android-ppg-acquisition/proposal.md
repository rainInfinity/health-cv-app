# Proposal

## Why

当前采集链路需要同时保存 PPG 像素统计和相机逐帧拍摄参数。仅生成 `ppg.csv` 会丢失旧项目独立记录的 `frame.csv` 元数据；本变更应在原生端补齐两份文件，同时避免旧项目的 JS 样本缓存和文件拼接路径。

## What Changes

- 新增 `packages/acquisition`，只实现 Android，以 Kotlin、CameraX 和 Nitro 接入后置相机控制与原生预览；提供手动打开、开始、停止和关闭操作。
- 分离相机来源、像素读取、只读完整像素视图和处理器组合。当前共用一次全帧统计，分别生成 PPG 记录和旧项目风格的过暗／覆盖提示；处理器仍能访问完整像素，不被限定为均值输入。
- 将 `DataHub<T>` 作为整个原生采集框架共用的有界批处理组件，按数据流／会话创建实例，负责顺序消费、错误传递和停止排空；PPG 与相机元数据 CSV 写入器只负责各自的格式和文件 I/O，由同一有序消费者写入配对记录。
- 原生侧连续写入应用私有持久目录，每个会话生成沿用旧 Android 字段的 `ppg.csv` 和 `frame.csv`。JS 不接收像素、样本或信号批次，只接收运行状态、提示、错误和包含两份文件引用的完成产物。
- 将默认界面由 Hello World 调整为采集验证界面；采集入口不依赖登录、云端环境变量或云端请求，保留既有认证与通信能力。
- 本次使用 Android 模拟器验证实际页面操作、CameraX 到两份本地 CSV 的链路、旧版列格式与逐帧对应关系，以及停止后的两份文件存在；不以文件存在宣称真实 PPG、设备性能或覆盖判断准确。用户后续自行进行真机验证，不将真机验收作为本次完成条件。
- 不实现 iOS、其他传感器来源、上传、云端推理、滤波、真实覆盖面积或医学质量门禁，不为这些功能添加占位实现。

## Capabilities

### New Capabilities

- `native-acquisition`：原生采集控制、完整像素处理边界、可复用有界数据管道、低频反馈与文件产物；本次实际来源为 Android 后置相机 PPG 及逐帧相机元数据。

### Modified Capabilities

- `android-app-foundation`：将开发应用的启动展示由 Hello World 更新为可操作的采集验证界面，保持 development build 可启动且不依赖 Expo Go。

## Impact

- 影响 `apps/native/App.tsx`、应用级采集组装、采集验证界面，以及新增的 `packages/acquisition`。完成产物契约由单文件引用扩为一个会话下的两份文件引用；不迁移或重写 `cloud-client`、认证流程和服务端接口。
- 使用现有 Expo 57／React Native 0.86.3／Nitro 0.37.1 基线；新增采集包所需的 CameraX、Nitrogen 和 Android 构建／自动链接配置。权限和宿主定制通过 Expo 配置或插件维护，不依赖生成目录里的手工修改。
- 实现阶段同步 `docs/architecture/code-organization.md`、`docs/architecture/technology-stack.md` 和 Android 开发说明，补充 PPG 与 frame CSV 字段、Camera2 元数据来源、DataHub 配对记录契约及模拟器验证记录；说明当前仅有 Android 实现且不向 JS 传递样本。
- 参考仓库用于核对设备 API、像素访问、PPG 与 frame 列定义及经验提示算法；沿用 CameraX 的 Camera2 capture callback 获取逐帧结果，但不复制旧桥接、无界缓存、共享可变批次元数据和 JS CSV 生成路径。
