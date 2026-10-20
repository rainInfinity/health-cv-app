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

### 手动操作与文件查询

在应用中按顺序手动打开后置相机、开始采集、停止并保存，再关闭相机并重新打开完成第二次采集。预览期间不创建 CSV；正常停止完成后，页面在会话下分别显示 `ppg.csv` 与 `frame.csv` 路径和大小。关闭相机不会删除已完成文件。

验证权限拒绝时，可先撤销模拟器中的权限，再从应用里请求并拒绝：

```sh
adb shell pm revoke com.healthcvapp.mobile android.permission.CAMERA
```

拒绝后页面应保持关闭状态并显示错误；该次请求不新增采集会话或完成文件。需要再次允许时，从 Android 应用权限设置授予相机权限。

用 `run-as` 检查应用私有目录中的两个完成产物；停止返回的路径以 `/files/` 后的相对部分对应 `files/acquisition/<sessionId>/`：

```sh
adb shell run-as com.healthcvapp.mobile find files/acquisition -type f \( -name ppg.csv -o -name frame.csv \) -print
```
检查同一会话中的文件表头及对应记录时，把 `<会话ID>` 替换为查询结果中的目录名：

```sh
SESSION_ID=替换为会话ID
adb shell run-as com.healthcvapp.mobile cat "files/acquisition/${SESSION_ID}/ppg.csv"
adb shell run-as com.healthcvapp.mobile cat "files/acquisition/${SESSION_ID}/frame.csv"
```

按行比较两份 CSV 的 `timestampFrame`；每行必须与 Camera2 的 `SENSOR_TIMESTAMP` 精确配对。旧协议对可选 Camera2 字段以 `0` 兜底，因此文件本身不能区分字段缺失和实际零值。

只有正常停止并完成逐帧关联、DataHub 排空和两个文件关闭后，`ppg.csv` 与 `frame.csv` 才作为同一会话的成功产物出现；失败中的 `.part` 不属于成功产物。该验证不要求上传、CSV 数值证明真实 PPG，也不证明目标 FPS、覆盖准确率、实体设备兼容或发热表现。

### Pixel_5 模拟器实测（2026-10-20）

在 Pixel_5 AVD 中手动打开后置相机、开始采集并正常停止。会话 `f6202159-ec77-4001-ae78-f698656107e2` 返回预览状态，页面显示 `ppg.csv` 为 25,008 bytes、`frame.csv` 为 17,880 bytes。两份文件各 239 行（含表头），共 238 条数据；逐行 `timestampFrame` 完全一致且递增，PPG `frameIndex` 从 0 连续至 237。

该结果验证模拟器中的相机回调、精确关联、双文件落盘和页面产物引用；模拟器画面不代表真实 PPG，未验证实体设备、传感器信号质量或性能。
