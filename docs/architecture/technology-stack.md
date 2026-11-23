# 技术选型与实施边界

本文维护技术选择与当前实施状态；模块职责见[代码组织](code-organization.md)，具体用法见[前端开发约定](../development/frontend-development.md)。依赖版本以各包 `package.json`、`pnpm-lock.yaml` 和原生构建配置为准，不另抄完整版本清单。

## 技术选择

| 领域 | 选择 | 当前边界 |
| --- | --- | --- |
| 应用与工程 | React Native、TypeScript、pnpm workspace | 应用位于 `apps/native`；已有 `acquisition`、`cloud-client` 包，`measurement` 包尚未实施。 |
| 原生构建 | Expo development build、Prebuild / CNG | 本地构建优先；自研采集不能使用 Expo Go，宿主定制由配置和插件维护。 |
| 导航 | React Navigation native-stack 与 bottom-tabs | 根栈、产品 Tab 和开发子栈；当前应用固定竖屏。 |
| 原生绑定 | Nitro Modules 与 Nitrogen | 采集控制、快照、视图；与相机实现及 Expo 工具链分别决策。 |
| Android 相机 | Kotlin、CameraX | 相机 PPG、主动及被动面部 RPPG；被动新会话不录像，旧视频独立查询。 |
| Android 传感器 | Kotlin `SensorManager` | 加速度计、陀螺仪、磁力计和重力独立控制并写 CSV。 |
| iOS 采集 | Swift、AVFoundation、Core Motion | 已选路线，尚未实施。 |
| 文件 | 原生连续写入；`react-native-file-access` 低频管理 | JS 不累计完整样本或拼接 CSV；原生产物通过引用交付。 |
| 应用状态 | Nano Stores、`@nanostores/react` | 低频应用状态和只读订阅；不保存完整信号或复制服务端缓存。 |
| 服务端数据 | React Query、Axios | 前者拥有内存查询缓存，后者封装在 `cloud-client` 执行单次传输。 |
| 偏好 | `@nanostores/persistent`、MMKV | 同步存储小型非敏感配置；注册引擎后创建 Store。 |
| 凭据 | `expo-secure-store` | 按服务地址与普通渠道隔离保存令牌对，不进入普通缓存或日志。 |
| 文案 | `@nanostores/i18n`、`expo-localization` | 当前产品固定 `zh-CN`；保留英文资源和解析工具不表示开放语言切换。 |
| 样式 | `styled-components/native` v6、统一浅色 token | 不引入第二套通用样式方案，不提供深色或跟随系统主题入口。 |
| 图标与图形 | Lucide、`react-native-svg`、本地业务 SVG | 显式导入；资产来源及生成边界见[原生图形约定](../development/native-graphics.md)。 |
| 图表 | ECharts + `@wuba/react-native-echarts` SVG 渲染器 | 面部与指尖的真实展示脉搏共用 ECharts 渲染，不使用 WebView 或 Skia；历史趋势／低频图表沿用此选型，不代表健康历史已实现。 |
| 动画 | native-stack 转场、RN `Animated` | 简单动效优先原生驱动；有复杂连续交互需求时再考虑 Reanimated。 |
| 网络与焦点 | NetInfo、AppState | 应用级接入 React Query 的 `onlineManager`／`focusManager`。 |

## 采集与数据路径

当前本地路径为原生采集／处理 → 应用专属外部完成文件 → 低频状态与产物引用。主动 RPPG 与指尖额外提供有界标量波形；指尖只保存原始双 CSV，不增加展示脉搏文件。被动 RPPG 不创建波形订阅。主动与被动 RPPG 共用处理与结果格式，但配置、触发及生命周期独立；指尖不使用面部 POS 或指标算法。

脉搏波仅按需注册折线图、Grid 与 SVG 渲染器，复用图表实例，随容器尺寸缩放并在卸载时销毁，关闭补间动画。面部与指尖分别按真实采集时间和连续性断线，仅保留本轮收到的展示历史；绘图不改写原始数据。具体依赖与使用约定见[前端开发约定](../development/frontend-development.md#24-图表与波形)。模拟器和录制视频可检查受支持的集成路径，不能替代真实手指、补光与脉搏验证，也不构成性能改善承诺。

高频图像、像素、ROI、关键点、相机元数据和传感器样本不跨桥传给 JS。DataHub 按流／会话有界管理，包含在途批次；数量／时间触发不在采样回调做磁盘 I/O，容量不足或写入失败不能静默丢数据后返回成功。具体参数、借用和排空规则见[PPG 协议](../acquisition/android-ppg.md)，算法、展示及新旧结果schema见[RPPG 协议](../acquisition/android-rppg.md)。

请求尺寸／FPS 与设备实际交付分开记录，颜色转换依据是显式工程假设。原生经验提示、指尖空间覆盖估计、信号质量和真实覆盖面积不是同一概念；有限采样覆盖比例不表示精确面积或医学结论。相机与传感器的跨源时间映射尚未定义。

连续文件写入采用平台原生 API；JS 文件库只承担低频文件管理。新产物以 `getExternalFilesDir(null)` 为根，位于 `Android/data/com.healthcvapp.mobile/files/`，沿用原有子目录、绝对路径引用与定稿条件；根目录不可用时明确失败，不回退内部存储，不新增权限。普通应用访问仍受限制，卸载应用仍会删除文件。已有内部文件不迁移、不删除；RPPG 查询保留两处完整结果，历史视频仍查询内部目录。停止与释放资源不等于删除，未完成文件不作为成功产物；产物保留、清理和进程异常恢复不能由偏好持久化推断。

## 云端目标与当前边界

产品目标包含完成信号文件后多文件上传云端处理，但当前 Native 测量未接入完整的创建任务、上传、提交和结果回显编排。已有通信包和认证能力不等于该业务闭环已完成。

`cloud-client` 一次上传一个文件引用，不将整文件转成字符串或 Base64；下载返回 Blob，不自动落盘。认证刷新与恢复归应用 auth，不放入 Axios 拦截器。React Query 管服务端缓存，Nano Stores 管应用状态，不镜像保存同一事实。详细传输与缓存合同分别见[云端接口](../development/cloud-client-api.md)、[认证会话](../development/native-auth-session.md)和[前端开发约定](../development/frontend-development.md)。

采集完成、上传到 100%、服务端收到任务和云端处理成功是不同事实；上传成功也不意味着可以删除本地文件。

## 构建与兼容原则

Nitro／Nitrogen 与 CameraX 的固定版本由采集包管理；Expo、React、RN、Nitro、MMKV、文件库作为整体兼容组合维护，不独立追逐最新版。Nitrogen 生成绑定属于构建产物，不要求另建手写公共 C++ 处理层。构建、安装与 Metro 操作见[Android 开发](../development/android-development.md)。

EAS 云构建不是必需项。采集源码留在功能包；重新生成宿主不能丢失必要配置。生成目录、第三方库安装成功或类型检查都不能证明真实采集、生产兼容或测量有效。

## 未实施与待确认事项

- iOS 原生采集、测量业务包、采集后自动上传、健康结果历史及历史波形回看。
- 生产设备与最低系统基线、OEM 后台相机限制、持续帧率、耗电、温升和性能。
- RPPG 试验参数评审、真实设备颜色／曝光表现、信号与参考仪器的时间对齐及误差。
- 跨相机／传感器同步、各模型的真实输入映射、结果字段、质量与评估规则。
- 数据授权、保留与删除策略，异常退出后的文件清理和业务恢复要求。
- 生产 API 与普通渠道配置；必须显式提供，不从设备语言或时区推断。

不预建流式网络传输、WeApp、通用状态机、事件总线、降级框架或无使用方的公共包。未来出现真实需求时再定义协议、背压及结束语义。

## 主要参考

- [Nitrogen](https://nitro.margelo.com/docs/concepts/nitrogen)、[Nitro 所有权与线程](https://nitro.margelo.com/docs/types/array-buffers)。
- [Expo development build](https://docs.expo.dev/develop/development-builds/introduction/)、[CNG](https://docs.expo.dev/workflow/continuous-native-generation/)。
- [Nano Stores](https://github.com/nanostores/nanostores)、[persistent](https://github.com/nanostores/persistent#persistent-engines)、[MMKV](https://github.com/margelo/react-native-mmkv)。
- [React Query Native](https://tanstack.com/query/latest/docs/framework/react/react-native)、[Axios multipart](https://axios-http.com/docs/multipart)、[styled-components Native](https://styled-components.com/docs/basics#react-native)。

外部文档会变化，具体支持范围以项目锁定版本和实际运行条件为准。
