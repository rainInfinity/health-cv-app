# Android 开发与验证

## 首次构建与安装

在仓库根目录按锁文件安装依赖，然后在 `apps/native` 生成 Android CNG 宿主并构建、安装 development build：

```sh
# 仓库根目录
pnpm install --frozen-lockfile

# apps/native
pnpm expo prebuild --platform android --clean
pnpm android
```

`prebuild --clean` 会删除并重建生成的 `apps/native/android`。`pnpm android` 会先生成采集包的 Nitrogen 绑定，再调用 Expo `run:android`；该命令使用已启动的 Android 模拟器或已连接设备。原生宿主配置应维护在 `app.json` 和 Expo config plugin 中，不要把生成目录里的手工改动当作唯一配置来源。

## 内部测试 Release APK

在 `apps/native` 执行：

```sh
pnpm android:release
```

脚本先运行采集包的 Nitrogen 代码生成，再执行 Gradle `assembleRelease`。若 `apps/native/android` 尚未生成，先执行 `pnpm expo prebuild --platform android`。APK 输出到 `apps/native/android/app/build/outputs/apk/release/app-release.apk`。

当前 release variant 使用 `debug.keystore` 签名，适合内部安装测试，不是正式发布签名包。

## Nitrogen 生成目录

根目录 `.gitignore` 忽略 `packages/acquisition/nitrogen/generated/`。在 `apps/native` 执行 `pnpm android` 或 `pnpm android:release` 都会先运行 Nitrogen，再启动 Android 构建；若 Android 宿主尚未生成，Release 仍需先按上节执行 Expo prebuild。

直接从 Android Studio 同步/构建，或手动执行 `./gradlew` 时，需先在仓库根目录运行：

```sh
pnpm --filter @health-cv-app/acquisition run nitrogen
```

采集包的 Gradle/CMake 配置会在构建配置阶段加载生成文件；绕过项目脚本时，Gradle 不会自动运行 Nitrogen。Expo prebuild 生成 Android 宿主，不会替代上述绑定生成步骤。

## 后续启动 Metro

原生依赖未变化且 development build 已安装时，在 `apps/native` 启动 Metro：

```sh
env -u CI NODE_OPTIONS=--dns-result-order=ipv4first pnpm expo start --localhost
```

在交互终端按 `a` 将项目打开到 Android development build。该环境继承了 `CI=true`，所以命令显式清除 `CI` 以启用终端交互；`NODE_OPTIONS` 让 `localhost` 优先解析为 IPv4，配合 ADB 反向端口转发，避免开发客户端尝试访问不可达的虚拟网卡地址。若需确认 ADB 设备连接，可运行 `adb devices -l`。

若执行环境无法把 `a` 快捷键传递给 Expo CLI，可按 CLI 当前打印的链接手动启动开发客户端；下列示例对应默认端口 8081：

```sh
adb reverse tcp:8081 tcp:8081
adb shell am start -W -a android.intent.action.VIEW -d 'exp+health-cv-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.healthcvapp.mobile
```

## 已验证环境与版本

| 项目 | 实际值 |
| --- | --- |
| 主机 | macOS 25.6.0，arm64 |
| Node.js / pnpm | 24.18.0 / 11.22.0 |
| JDK | Azul Zulu OpenJDK 17.0.20 |
| Android SDK | `$ANDROID_HOME` 与 `$ANDROID_SDK_ROOT` 均为 `/Users/junsi/Library/Android/sdk`；已安装平台 android-36、android-37.0，Build Tools 36.0.0，Platform Tools 37.0.1，Emulator 37.1.11 |
| Gradle / Android NDK | Gradle 9.3.1；该构建实际使用 NDK 27.1.12297006 |
| 验证设备 | `Pixel_5` Android Virtual Device，Android 17 / API 37，arm64 模拟器 |

应用锁文件解析出的关键依赖版本：Expo 57.0.27、`expo-dev-client` 57.0.19、React 19.2.3、React Native 0.86.3、`react-native-mmkv` 4.3.2、`react-native-nitro-modules` 0.37.1、`react-native-file-access` 4.0.4、React Navigation 7.5.0、native-stack 7.20.0、Nano Stores 1.5.5（React 绑定 2.0.1、persistent 1.3.5、i18n 1.3.3）、React Query 5.104.1、Axios 1.20.0、styled-components 6.5.3、TypeScript 6.0.3。精确依赖树以 `pnpm-lock.yaml` 为准。
采集模块另外固定 Nitrogen 0.37.1 与 AndroidX CameraX 1.6.2，分别由 `packages/acquisition/package.json` 和 `packages/acquisition/android/build.gradle` 管理。

## 验证记录与边界
以下内容记载早期 Android foundation 与 cloud-client/auth 的历史验证，不代表本次 PPG 采集实现的验证状态。

- 已执行锁文件干净安装、Android `prebuild --clean`、`pnpm expo run:android`，并在 `Pixel_5` 模拟器安装、启动 development build。APK 中包含 MMKV 与 Nitro 相关原生库；Gradle 也编译了 `react-native-file-access`。
- Android 运行时用短暂的入口代码对 MMKV 执行字符串写入、读回与删除，并对缓存目录文件执行创建、写入、读取和清理；读回匹配。临时代码已移除，应用重新启动后仍显示 `Hello World`。
- 本机当时无法解析 `dl.google.com`。`apps/native/plugins/with-aliyun-gradle-repositories.js` 与 `patches/` 中的 Gradle 插件补丁为 included build、插件和子项目依赖添加 Aliyun Maven 仓库；官方仓库仍保留为后备。若网络可访问 Google Maven，这些镜像配置仍作为前置仓库。
- 仅验证了 Android arm64 模拟器。未验证实体设备、iOS、自研 Nitro 采集模块（Spec／Nitrogen 绑定及 Kotlin/Swift 实现），也未实现或验证测量、采集和上传业务。安装 Nitro Modules 与第三方 MMKV 只证明其进入 Android 构建，不代表自研采集能力已可用。

### `add-cloud-client-and-auth` 跨模块验证

- 环境：`Pixel_5` Android 17 / API 37 / arm64 模拟器；测试服务根地址 `https://test-backend.myhealthyclub.com`，显式渠道 `android-cn`。使用获授权测试账号，不在记录中保存凭据。
- 重建命令：`env -u CI NODE_OPTIONS=--dns-result-order=ipv4first EXPO_PUBLIC_API_BASE_URL=https://test-backend.myhealthyclub.com EXPO_PUBLIC_CHANNEL=android-cn pnpm --dir apps/native exec expo run:android`。Gradle 返回 `BUILD SUCCESSFUL` 并安装 APK；`expo-secure-store`、`react-native-file-access` 原生依赖均已纳入 Android development build。
- `run:android` 首次自动启动曾将开发客户端指向不可达的 `198.18.0.1:8081`，界面显示 Metro 流读取错误。按本机网络边界改用 ADB 反向转发后成功启动：

  ```sh
  adb reverse tcp:8082 tcp:8082
  adb shell am start -W -a android.intent.action.VIEW -d 'exp+health-cv-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082' com.healthcvapp.mobile
  ```

- 最终 APK 启动后实际显示 `Hello World`；按 Android 返回键后回到模拟器主页。`apps/native/index.ts` 在注册根组件前导入 bootstrap，已恢复的基线页面不承担会话恢复。
- 使用受控账号完成登录与跨启动恢复、本人资料读取/更新并恢复原值、模型目录读取、草稿创建、输入文件上传/下载、提交及详情读取。任务状态为 `SUBMITTED`，详情没有 `output_files`；未能验证成功输出文件下载。文件字节、错误和进度结果见 [普通渠道云端请求接口](./cloud-client-api.md)。
- 本次最终回归：cloud-client 类型检查与 11 项测试通过；Native 类型检查与 25 项测试通过。Native 覆盖认证状态、刷新/退出竞态、缓存隔离、迟到查询/变更和文件边界。
- 未验证 iOS、实体设备或可成功下载的输出文件；未发布模型、切换渠道或添加任务轮询。此验证仅覆盖指定 Android 模拟器和 `android-cn` 测试环境。

## Android 后置相机 PPG 采集

当前默认页面是可手动操作的 `AcquisitionScreen`，不再是 Hello World。启动应用不会自动打开相机或保存数据；采集入口不要求登录、服务地址或渠道配置。

### 模拟器与构建

仓库当前的 `Pixel_5` AVD 后置相机配置为 `virtualscene`，可提供 Android 模拟器的虚拟场景输入。其它 AVD 可在 Android Studio Device Manager 的高级设置中将后摄设为 Virtual Scene 或可用的主机摄像头；不要手工修改生成的宿主工程来配置采集模块。检查 AVD 和连接状态：

```sh
emulator -list-avds
adb devices -l
```

从仓库根目录安装锁文件依赖，在 `apps/native` 生成 Android 宿主并安装 development build：

```sh
# 仓库根目录
pnpm install --frozen-lockfile

# apps/native
pnpm expo prebuild --platform android --clean
env -u CI NODE_OPTIONS=--dns-result-order=ipv4first pnpm android
```

`prebuild --clean` 会重建生成的 `apps/native/android`；采集源码和自动链接配置保留在 `packages/acquisition`，相机权限由 `apps/native/app.json` 声明。该链路必须使用 development build，不使用 Expo Go。

**端口冲突：** 如果 `run:android` 发现 8081 已被占用并跳过 Metro，development build 可能仍指向旧服务器。在 `apps/native` 另开终端，用本机回环地址启动 Metro 并打开 Android：

```sh
adb reverse tcp:8082 tcp:8082
env -u CI NODE_OPTIONS=--dns-result-order=ipv4first pnpm expo start --localhost --port 8082 --android
```

### 本次模拟器运行记录（2026-10-20）

- 设备：`Pixel_5` AVD，Android 17 / API 37 / arm64，后摄输入为 `virtualscene`；`emulator -list-avds` 和 `adb devices -l` 分别确认 AVD 与 `emulator-5554`。未配置服务地址／渠道，也未登录。
- 构建：`pnpm install --frozen-lockfile`、`pnpm expo prebuild --platform android --clean` 均成功；`env -u CI NODE_OPTIONS=--dns-result-order=ipv4first pnpm expo run:android` 的 Gradle 构建为 `BUILD SUCCESSFUL` 并安装 development build。此次 8081 已占用，首次打开时未加载项目；按上面的 8082 本地 Metro 步骤启动后，`AcquisitionScreen` 正常加载。
- 实际操作：手动打开后摄、开始并停止采集；预览显示 `1280 × 960` 虚拟场景。`dumpsys media.camera` 显示 `SurfaceView` 预览和 `ImageReader` 分析输出；关闭后 `Active Camera Clients` 为空，再打开后两路输出恢复。停止后页面返回预览状态。
- 文件结果：两次采集分别产生 `files/acquisition/33a17cda-c834-450a-87a6-c16fe96a6f35/ppg.csv`（12990 bytes）和 `files/acquisition/7a496e07-b683-4eb0-a3f2-42f852b3196b/ppg.csv`（11669 bytes），路径不同、互不覆盖。文档中的 `run-as find` 命令实际列出这两个文件。
- 回归：`./gradlew :health-cv-app_acquisition:testDebugUnitTest` 成功；Native 测试 25/25、cloud-client 测试 11/11；`@health-cv-app/native`、`@health-cv-app/cloud-client`、`@health-cv-app/acquisition` 类型检查成功。
- 边界：`virtualscene` 只验证模拟器相机输入、处理和文件写入链路，不是生理 PPG。未验证实体设备信号、目标 FPS、覆盖准确率或发热表现；这些不是本次变更的待办验收项。

### 预览生命周期注意事项

预览使用 `PreviewView.ImplementationMode.PERFORMANCE` 的 `SurfaceView` 实现。验证关闭后在同一页面重新打开时，应确认预览画面和图像分析流都恢复；仅凭页面状态不能证明 CameraX 已重新输出帧。

### 页面操作、参数／网格验收与文件查询

在 `主动 PPG` 页按此顺序操作：

1. 点击“显式请求相机权限”，再单独点击“枚举可选相机”；这两步不会打开相机、启用补光或创建会话。
2. 选择本次使用的 camera ID。设置 Preview + YUV 候选宽度／高度（px）与目标 FPS，点击“查询所选相机能力与组合”。查询只适用于当前 camera ID、尺寸和 FPS；切换相机或改动尺寸／FPS 后重新查询。静态模式、数值范围、布尔能力及组合结果分别显示 `支持`、`明确不支持` 或 `未知`，数值范围附单位。
3. 在“本次配置草稿”选择有支持证据的曝光、白平衡、对焦及 torch 模式，按设备范围填写手动曝光时间（ns）、ISO、曝光补偿步长、手动对焦距离（屈光度）；编辑 `rows`、`columns` 网格。运行中这些输入不可编辑，打开时配置冻结。
4. 点击“打开已选相机配置”，核对当前周期冻结配置、相机 ID、实际帧尺寸／观测 FPS 和 AE／AWB 锁定阶段。正式采集须另行点击“开始采集”；正常完成用“停止并保存”，随后“关闭相机”。未授权、未查询或候选组合不匹配时不应显示可用的打开操作；无云端登录仍可完成本地采集。
5. 至少运行 `[1,1]`、上下条带 `[N,1]`、左右条带 `[1,N]` 和非方形网格（如 `[2,3]`）。尺寸／FPS 或相机变更后重新查询；非法网格应显示错误且不开始会话、不产出完成 CSV。确认 `[rows, columns]` 下每个正式帧有 `rows × columns` 条 PPG 行，`blockIndex` 按行优先从 0 连续排列，而 `frame.csv` 仍每帧一行。

验证权限拒绝时，可先撤销模拟器中的权限，再从应用里请求并拒绝：

```sh
adb shell pm revoke com.healthcvapp.mobile android.permission.CAMERA
```

拒绝后页面应保持关闭状态并显示错误；该次请求不新增采集会话或完成文件。需要再次允许时，从 Android 应用权限设置授予相机权限。

用 `run-as` 检查应用私有目录中的完成产物；停止返回的路径以 `/files/` 后的相对部分对应 `files/acquisition/<sessionId>/`：

```sh
adb shell run-as com.healthcvapp.mobile find files/acquisition -type f \( -name ppg.csv -o -name frame.csv \) -print
```
检查同一会话中的文件表头及对应记录时，把 `<会话ID>` 替换为查询结果中的目录名：

```sh
SESSION_ID=替换为会话ID
adb shell run-as com.healthcvapp.mobile cat "files/acquisition/${SESSION_ID}/ppg.csv"
adb shell run-as com.healthcvapp.mobile cat "files/acquisition/${SESSION_ID}/frame.csv"
```

PPG CSV 中同一 `frameIndex` 的多块记录共享 `timestampFrame`，按帧分组后核对 `blockIndex`；每组 `timestampFrame` 必须与 `frame.csv` 的 `timestampFrame` 精确对应。不要按两份 CSV 的行号比较：frame 文件每帧一行，PPG 文件每帧可有多行。预览、未完成采集或失败中的 `.part` 不属于成功产物；只有正常停止、关联队列排空、两个文件关闭并同时发布后才显示完成文件。

该验证只检查相机配置、页面状态和文件协议；CSV 数值不证明真实 PPG，不代表目标 FPS、覆盖准确率、实体设备兼容或发热表现。

### Pixel_5 模拟器实测（2026-10-20）

在 Pixel_5 AVD 中手动打开后置相机、开始采集并正常停止。会话 `f6202159-ec77-4001-ae78-f698656107e2` 返回预览状态，页面显示 `ppg.csv` 为 25,008 bytes、`frame.csv` 为 17,880 bytes。两份文件各 239 行（含表头），共 238 条数据；逐行 `timestampFrame` 完全一致且递增，PPG `frameIndex` 从 0 连续至 237。

该结果验证模拟器中的相机回调、精确关联、双文件落盘和页面产物引用；模拟器画面不代表真实 PPG，未验证实体设备、传感器信号质量或性能。

### 架构重构后 Pixel_5 AVD 回归（2026-10-21）

使用 `Pixel_5` AVD（`emulator-5554`，Android 17／API 37／arm64）运行本次 Android development build。两次主动采集都从界面正常停止，关闭后重新读取各自独立会话目录中的两份 CSV：

| 会话 ID | `ppg.csv` 数据行 | `frame.csv` 数据行 | 文件大小（PPG／frame） |
| --- | ---: | ---: | ---: |
| `0dc9a330-6919-4d05-b55e-6f5e522eb965` | 295 | 295 | 31,053／22,125 bytes |
| `f8b11e1a-749f-4e6e-bfc9-863a5e42ddf8` | 400 | 400 | 42,129／29,959 bytes |

PPG 表头为 `timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex`；frame 表头为 `timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode`。每次采集的两份文件逐行 `timestampFrame` 完全一致，PPG `frameIndex` 分别从 0 连续至 294、399。停止后立即再次点击同一控件位置，页面回到预览且未出现第三份会话产物；两个已完成会话的 CSV 均可在相机关闭后读取。

AVD 使用虚拟场景，只验证模拟器相机回调、逐帧配对与文件落盘；不代表真实人体 PPG、实体设备信号或性能。

### 可配置相机与网格采集验证（2026-10-23）

设备为 `Pixel_5` AVD（`emulator-5554`、Android 17／API 37、arm64，后摄 `virtualscene`）；应用未登录、未配置云端。界面枚举 cameraId `1`（前摄、方向 270°）和 `10`（后摄、方向 90°）。cameraId `1` 实测支持手动曝光／ISO、AWB 预设、手动 AF、torch 及 AE／AWB 锁；cameraId `10` 对手动曝光／ISO、torch 和两种锁返回明确不支持，未提交这些请求。

从界面分别提交两组手动曝光配置。完成文件停止相机后从应用私有目录读取；`frame.csv` 的曝光、ISO 和白平衡值来自真实 Camera2 结果，不是 JS 配置回显：

| 会话 ID | 冻结请求 | `frame.csv` 数据行 | Camera2 实际曝光／ISO／AWB 模式 | `ppg.csv` 数据行 |
| --- | --- | ---: | --- | ---: |
| `b3b9ff06-1221-4678-85a8-637669ede4c0` | cameraId `1`；目标 640×720／30 FPS；manual 10,000,000 ns／ISO 200；daylight；manual focus 0 屈光度；torch 开；`[2,3]` | 694 | 10,000,000 ns／200／5 | 4,164 |
| `60ea14d9-e51c-49fb-9dab-7e7e697dcf89` | cameraId `1`；manual 30,000,000 ns／ISO 400；daylight；`[2,3]` | 262 | 30,000,000 ns／400／5 | 1,572 |

两次相机帧均为 1024×768、有效 crop `(0,0) 1024×768`；请求的 30 FPS 是目标，不是模拟器的交付保证。CameraService dump 同时观察到 torch `TORCH`、手动对焦 `AF_MODE_OFF`／0 屈光度；关闭 torch 的默认预览观察到 `OFF`。白平衡模式值 `5` 对应该设备实际提交的 daylight 模式。

下表中的 CSV 均在相机关闭后直接读取，表头仍为既有八列；逐帧核验 `frameIndex` 连续、PPG 的 `timestampFrame` 与 `frame.csv` 精确对应、块编号按行优先排列，且会话目录没有 `.part` 文件：

| 网格 | 会话 ID | PPG 数据行 | frame 数据行 | 独立核对 |
| --- | --- | ---: | ---: | --- |
| `[1,1]` | `a2e31171-c358-4735-b977-d1b536fd304d` | 563 | 563 | 563 组，每帧仅块 0 |
| `[3,1]` | `ec1883bc-365b-478e-a3b6-11a1ab62a694` | 1,218 | 406 | 每帧块 0–2，时间戳精确分组 |
| `[1,3]` | `9b937a71-99c1-479b-a503-d70aa11ecb3f` | 267 | 89 | 每帧块 0–2，时间戳精确分组 |
| `[2,3]` | `60ea14d9-e51c-49fb-9dab-7e7e697dcf89` | 1,572 | 262 | 每帧块 0–5，时间戳精确分组 |

模拟器 UI 把行数设为 `65`、列数设为 `1` 后，打开操作显示“分块网格超过已查询的最大块数或目标尺寸约束。”；运行状态仍为关闭，`dumpsys media.camera` 没有活动客户端，完成 PPG 文件数未增加。恢复 `[1,1]` 后按相同查询、打开、开始、停止路径再次成功。已知像素夹具的独立均值和共享色度边界数值见[相机 PPG 协议](../acquisition/android-ppg.md#二维分块坐标与色度边界)；AVD 虚拟场景不作为像素夹具或真实生理信号。
另按此流程复测单块会话 `4923331c-54a4-45a5-bfaa-aa7cbaecced6`：`Pixel_5` AVD（Android 17／API 37／arm64）选择前摄 cameraId `1`，请求 640×720 px、目标 30 FPS、自动曝光／白平衡／对焦、`[1,1]`，未登录或配置云端。预览显示冻结请求、实际 1024×768 帧和观测 FPS；开始后按钮变为“停止并保存”，停止后恢复“开始采集”。采集中滚至配置区并点击行数输入框，控件保持禁用、值仍为 `[1,1]`。关闭后从 `files/acquisition/4923331c-54a4-45a5-bfaa-aa7cbaecced6/` 读取到两份完成 CSV，各 1,739 条数据行，PPG 块编号均为 0，逐行 `timestampFrame` 相同，Camera2 实际结果为约 2,099,223 ns／ISO 100／AWB 模式 1；两文件分别为 200,399／149,113 bytes。`dumpsys media.camera` 显示活动客户端为空。另在撤销相机权限并重启后，页面显示“尚未通过本页确认”、能力查询按钮禁用；经页面显式请求并在系统弹窗允许后，权限恢复，但仍须枚举和查询才能打开相机。
按同一页面步骤再运行非方形网格 `[2,3]` 会话 `379dcf99-580b-45a7-b4e0-7b434f7d1c76`：Pixel_5 AVD（Android 17／API 37／arm64）、cameraId `1`、请求 640×720 px／30 FPS，自动曝光／白平衡／对焦。打开时 UI 显示冻结的 `[2,3]` 配置；开始、停止并保存后关闭相机。直接从应用目录读取到仅有 `ppg.csv`（308,214 bytes）和 `frame.csv`（38,400 bytes），无 `.part`；两文件分别有 2,682 和 447 条数据，PPG 的 `frameIndex` 连续为 0–446，每帧恰有按行优先排列的块 0–5。447 组 PPG `timestampFrame` 均与 `frame.csv` 一一匹配；相机关闭后 `dumpsys media.camera` 的 `Active Camera Clients` 为空。首帧六块的 `avgY` 分别为 150.8833、159.2741、226.8075、84.4455、102.0970、222.0528；这是虚拟场景测值，不作为真实生理信号或实体像素夹具预期值。
随后再次通过 `run-as` 从应用私有目录读取表中四种网格以及本次 `[1,1]`、`[2,3]` 复测的六个会话，不使用 JS 样本缓存：每个目录只有完成的 `ppg.csv`／`frame.csv`，表头与上列协议一致；各会话的 `frameIndex` 从 0 连续递增，PPG 每帧行数等于网格块数、`blockIndex` 连续行优先排列，PPG 与 frame 的唯一帧时间戳集合双向完全对应。所有已采样的 Y／U／V 均值为有限值且在 0–255 范围。独立像素夹具测试 `PixelBlockStatisticsTest` 还断言 `[2,3]` 各块的 Y/U/V 均值和整帧值，覆盖带行填充、非零 crop、共享交错色度单元的情况。

### 类型检查、Nitro 与 Android 回归（2026-10-23）

从仓库根目录依次运行 `pnpm --filter @health-cv-app/acquisition run nitrogen`、`pnpm --filter @health-cv-app/acquisition run typecheck`、`pnpm --filter @health-cv-app/native run typecheck` 和 `pnpm --filter @health-cv-app/native run test`。Nitro 生成 4／4 个 HybridObject；两项类型检查成功；Native 行为测试 28／28 通过。

在 `apps/native/android` 执行 `./gradlew :health-cv-app_acquisition:testDebugUnitTest :app:assembleDebug`，结果为 `BUILD SUCCESSFUL`。JUnit 报告共 31 个测试套件、120 项测试，失败／错误／跳过均为 0；包含相机配置校验、捕获锁定／解锁、像素网格与色度均值、帧关联、多行 CSV writer、CameraUseGuard 和传感器配置／六列 CSV。Debug APK 编译完成。构建输出有 Expo 未设置 `NODE_ENV` 的提示，以及 Nitro 生成 C++ 的未使用参数 warning，均未阻断构建。

自动 AE 与 AWB 锁的 UI 采集在每次正式开始前显示 `locked`；Camera2 结果为 AE／AWB `ON`、`LOCKED`。两次正常停止后新结果均为 AE／AWB `OFF`、`CONVERGED`，第二次开始重新得到当前周期锁确认；关闭相机后活动客户端为空。Pixel_5 只验证成功解锁；无法稳定注入设备级解锁失败，该分支由 `CaptureLockReleaseTest` 覆盖：解锁失败保留已完成产物并调用关闭当前周期的收尾。

### 主动／被动相机与传感器并行验证（2026-10-23）

被动页在服务关闭时保存 5 秒周期、1 秒录像时长；保存后仍为 disabled，CameraService 没有活动客户端。通过页面显式启用并确认 AVD 设置后，`PassiveCaptureService` 进入前台等待，期间相机空闲。被动服务等待时打开 PPG 页查询并打开 cameraId `1`，前台服务仍运行、未提前打开相机；活动客户端仅为 PPG 的 cameraId `1`。返回桌面后 PPG 客户端释放，服务仍等待；之后通过 AVD 实际锁屏／唤醒手势触发系统解锁事件，CameraService 记录被动录像相机连接后释放。被动页显示“视频已完成收尾并发布”，会话 `050a26d3-8ee0-404a-b1b1-5d27263c8b80` 为 1280×720、1.944 秒、662,688 bytes；本次未重新完整解码视频。测试结束后从页面关闭服务，服务列表无 `PassiveCaptureService`，相机活动客户端为空。
另在被动服务保持关闭时复查隔离：被动页显示“未启用”，ActivityManager 服务列表为 `(nothing)`；返回 PPG 页枚举 cameraId `1` 并成功查询 720×720／30 FPS 组合，将草稿曝光从 auto 切为 supported manual 再恢复 auto。整个查询／草稿编辑期间 `dumpsys activity services com.healthcvapp.mobile` 仍无服务、`dumpsys media.camera` 的活动客户端为 `[]` 且 cameraId `1`／`10` 均关闭；`files/acquisition` 最新会话仍是先前的 `379dcf99-580b-45a7-b4e0-7b434f7d1c76`，未新增会话目录。

另一次在锁定准备期间把 PPG 放到后台，CameraService 断开 PPG 相机，后续真实解锁由等待中的被动服务连接并释放 cameraId `1`；被中断 PPG 会话只有 `.part`，没有作为成功产物发布。Android 单元测试 `CameraUseGuardTest` 覆盖主动／被动竞争、旧租约迟到释放不能解除新持有者和打开失败后释放；模拟器观察到前一相机断开后服务才能取得相机，未见旧客户端重新打开。

传感器与 PPG 独立启停：加速度计会话 `bc5852f5-f57c-4c3b-b78e-50305fd483dc` 在 PPG 页面打开、采集和停止期间继续运行，之后从应用私有目录读取到 10,833 条数据行。`accelerometer.csv` 表头为 `timestamp,timestampEvent,timestampSystem,accX,accY,accZ`，每条记录均为六列；PPG 停止没有停止该传感器会话。

复查相机和 CSV 的命令：

```sh
adb shell dumpsys media.camera
adb shell run-as com.healthcvapp.mobile find files/acquisition -type f \( -name ppg.csv -o -name frame.csv \) -print
adb shell run-as com.healthcvapp.mobile cat "files/acquisition/<会话ID>/ppg.csv"
adb shell run-as com.healthcvapp.mobile cat "files/acquisition/<会话ID>/frame.csv"
```

以上结果仅验证 Pixel_5 AVD 的相机、租约、传感器回调、页面状态和文件协议；不代表真实人体 PPG、实体设备兼容性或目标帧率。

## Android 无扰式被动采集

### Pixel_5 模拟器实测（2026-10-20）

- 设备：`Pixel_5` AVD，`emulator-5554`，Android 17 / API 37 / arm64；应用 target SDK 36。验证安装内部 Release APK，未运行 Metro。未登录或配置云端服务。
- 权限：在应用和 Android 系统界面中手动完成相机、通知授权；未使用 `adb grant`。通知渠道关闭时，应用明确报错且没有启动服务或打开相机；恢复渠道后通过界面重新启用。
- 配置：周期 12 秒、目标录像 2 秒；另用 15 秒与 60 秒配置验证不同长度的完整媒体。实际文件、尺寸、时长、大小与解码帧数见 [Android 无扰式被动采集协议](../acquisition/android-passive-capture.md)。
- 解锁：使用 `input keyevent 223`、`224`、`82` 让 AVD 睡眠、唤醒并解锁，观察到系统真实 `USER_PRESENT`，未发送伪造广播。临时测量构建在动态接收器 `onReceive` 与 CameraX `VideoRecordEvent.Start` 读取 `SystemClock.elapsedRealtime()`；本次样本分别为 `5,442,799 ms` 和 `5,443,059 ms`，事件到 Start 为 `260 ms`。该数值仅是模拟器单次观测，不代表真机延迟。CameraService 显示 Camera ID 1、前摄。
- 等待：`dumpsys activity services` 显示前台 `PassiveCaptureService`；`dumpsys media.camera` 的 `Active Camera Clients` 为空。解锁录像期间 CameraService 显示 Camera ID 1、前摄。切换 PPG／被动页面不关闭等待服务。
- 通知关闭：分别在等待和实际录像中点击“关闭无扰采集”。等待关闭后服务结束；录像中关闭后完成文件数保持 6 → 6，未完成片段未发布且相机释放。重新启用并真实解锁后，文件数 6 → 7。另验证禁用状态下真实解锁不增加文件。
- 启动失败：暂时禁用服务组件后在页面尝试启用，状态显示 `FOREGROUND_SERVICE_START_TIMEOUT`，没有报告运行中；系统服务列表为空、相机无活动客户端。随后用 `pm default-state` 恢复服务组件。
- 系统停止：执行 `am force-stop com.healthcvapp.mobile` 后无被动服务或相机客户端；重新进入应用仍未启用，之前的视频仍可查询。
- 录像状态回归：实测重复 `USER_PRESENT` 曾使忙碌分支把界面状态错误回退为等待，而实际录像仍在继续。修复后再次覆盖通知状态，确认录像状态仍显示“无扰式采集进行中”，关闭录像不会发布未完成片段。
- 相机互斥：将被动时长设为 60 秒并在录像时切到主动 PPG，点击“打开后置相机”显示“相机正被另一种采集会话使用。”；PPG 保持关闭，CameraService 只有被动录像的一个 Camera ID 1 客户端，被动前台服务继续运行。切回被动页仍显示“前摄正在录像”。

Release APK 与核心诊断命令：

```sh
pnpm --dir apps/native exec expo prebuild --platform android
pnpm --filter @health-cv-app/native run android:release
adb -s emulator-5554 install -r apps/native/android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell dumpsys activity services com.healthcvapp.mobile/com.healthcvapp.acquisition.passive.service.PassiveCaptureService
adb -s emulator-5554 shell dumpsys media.camera
adb -s emulator-5554 shell input keyevent 223
adb -s emulator-5554 shell input keyevent 224
adb -s emulator-5554 shell input keyevent 82
adb -s emulator-5554 shell am force-stop com.healthcvapp.mobile
```

### 回归命令与结果

```sh
./gradlew :health-cv-app_acquisition:testDebugUnitTest # 工作目录：apps/native/android
pnpm --filter @health-cv-app/native test
pnpm --filter @health-cv-app/cloud-client test
pnpm --filter @health-cv-app/native run typecheck
pnpm --filter @health-cv-app/acquisition run typecheck
pnpm --filter @health-cv-app/cloud-client run typecheck
```

Nitro 绑定生成、CNG 重建、Release 构建及安装成功。Gradle 原生采集测试 `BUILD SUCCESSFUL`；Native 测试 25/25、cloud-client 测试 11/11；三项 TypeScript 类型检查均成功。

模拟器中服务启动失败显示 `FOREGROUND_SERVICE_START_TIMEOUT`，通知渠道关闭时拒绝启动；两项均确认服务未运行且相机未打开。运行中撤销权限、通知划除与通知声／振动／悬浮提醒等项目的模拟器结果未覆盖；Honor 真机验收见下文。

模拟器结果只适用于 Pixel_5 AVD。Honor PPG-AN00 的最终真机验收见下文；其他厂商限制仍未验证。模拟器虚拟画面不证明真实人体信号或 rPPG 有效。

### 架构重构后 Pixel_5 AVD 回归（2026-10-21）

本次在同一 `Pixel_5` AVD 上用界面启动已迁移的前台服务；设置周期 12 秒、目标时长 15 秒及 60 秒后，通过系统睡眠、唤醒和解锁按键序列触发真实 `USER_PRESENT`，没有发送伪造广播。被动页面等待时 `Active Camera Clients` 为空；录像使用前摄 Camera ID 1。

被动录像、通知取消及原目录复查的详细结果见 [架构重构后 Pixel_5 AVD 回归记录](../acquisition/android-passive-capture.md#架构重构后-pixel_5-avd-回归2026-10-21)。本次只验证 AVD 短周期运行路径，不重做 Honor 真机验收或 7200 秒长待机；模拟器虚拟画面不证明真实人体信号。

### Honor PPG-AN00 真机授权与后台策略复测（2026-10-20）

- 设备：Honor PPG-AN00，Android 16／API 36，`targetSdk=36`；安装包含 JS bundle 的内部 Release，不依赖 Metro。
- 启用后台设置：手动管理，打开“允许后台活动”，保持“允许自启动”和“允许关联启动”关闭。页面提示仅在点击“授权并启用无扰采集”时显示；打开应用设置入口进入 `com.android.settings/.applications.InstalledAppDetails`。用户确认后服务进入等待态。
- 构建及安装：

  ```sh
  pnpm --filter @health-cv-app/native run android:release
  adb -s <device-serial> install -r apps/native/android/app/build/outputs/apk/release/app-release.apk
  ```

- `dumpsys activity services com.healthcvapp.mobile` 显示 `isForeground=true`、通知 ID `7312`。设备退到桌面并锁屏时，相机客户端为空；设备主人真实解锁后，CameraService 记录两次应用客户端连接／释放：20:18:11–20:18:17 与 20:18:58–20:19:05。20:19:18 检查时前台仍为 Honor Launcher，活动相机客户端为空。系统广播记录在 20:18:11 入队，存在于 20:18:58 完成的延后记录；没有独立记录实际解锁次数，因此不据此断言发生了两次物理解锁。
- 该次记录是 2026-10-20 的初步观察，仅证明该机在上述设置下能够后台打开并释放相机；没有导出或完整解码视频。后续最终验收结论见下一节。

### Honor PPG-AN00 剩余真机验收补充（2026-10-21）

设备、Release 构建和 Honor 后台活动设置同上一节。本助手此前在 30 秒周期／5 秒时长下观察到两次设备解锁机会：`USER_PRESENT` 于 13:24:03 和 13:29:42 入队；CameraService 分别在 13:24:03–13:24:09 与 13:29:43–13:29:49 连接应用相机后释放。第一次发生于后台等待，第二次在应用页面可见时；两段之间相机为空。这只记录短周期观测，不单独证明媒体解码或 7200 秒验收。

设备操作者确认剩余真机验收项目均通过，包括：

- 通知安静显示、状态入口和不依赖页面执行的关闭操作；无声音、振动或悬浮提醒；通知划除、通知权限／渠道禁用及系统停止应用可区分。
- Release 应用在真实解锁时后台录像；周期内不录像、周期到期但没有解锁不录像、应用可见时解锁仍触发；切换其他 App 不终止录像，录像中重新锁屏会结束未完成片段，必要条件失效后停止接受采集。
- 按目标 7200 秒周期完成后台等待及前后两次解锁录像，等待期间相机无占用；两份真机视频已完成媒体探测、完整解码和画面检查。

以上最终验收结论来自设备操作者确认。本次交接未包含两小时等待的精确起止时刻、服务状态快照、两份视频的会话标识及详细媒资数值，因此不补写这些读数。设备范围仅为 Honor PPG-AN00；其他厂商未验证，视频可读不代表 rPPG 有效。

## Android 传感器采集

SensorManager 采集协议、错误、设备边界和 Pixel_5 AVD 实测记录见[Android 传感器采集](../acquisition/android-sensors.md)。Android 传感器采集已接入 `@health-cv-app/acquisition` Nitro 绑定及独立验证页；不需要 Expo Go。传感器 API 本身没有新增权限，应用既有 `CAMERA`、`POST_NOTIFICATIONS` 和前台服务权限仍供相机与被动采集使用。

从仓库根目录生成绑定、检查 TypeScript 并构建 Android development build：

```sh
pnpm --filter @health-cv-app/acquisition run nitrogen
pnpm --filter @health-cv-app/acquisition run typecheck
pnpm --filter @health-cv-app/native run typecheck
pnpm --filter @health-cv-app/native run android
```

直接运行原生测试时在 `apps/native/android` 执行：

```sh
./gradlew :health-cv-app_acquisition:testDebugUnitTest
```

### 本次传感器变更最终回归

仓库根目录执行包与应用类型检查及 Nitro 绑定生成；最后一条 Gradle 命令在 `apps/native/android` 执行：

```sh
pnpm --filter @health-cv-app/acquisition run typecheck
pnpm --filter @health-cv-app/native run typecheck
pnpm --filter @health-cv-app/acquisition run nitrogen
./gradlew :health-cv-app_acquisition:testDebugUnitTest :app:assembleDebug
```

两项类型检查与 Nitro 绑定生成成功；Gradle 输出 `BUILD SUCCESSFUL`，共 491 项任务（67 executed、424 up-to-date）。

本次 AVD 使用 `emulator-5554`、Android 17／API 37。`run:android` 的 APK 构建成功，但 Expo CLI 自动解析 development-client deep link 失败；通过 `adb shell monkey -p com.healthcvapp.mobile 1` 手动打开已安装应用后，传感器页正常加载并完成实际采集。模拟器传感器输入、CSV 读取及各会话数据行数见传感器协议文档；这只验证 Android Emulator 的系统回调，不代表实体设备传感器。
