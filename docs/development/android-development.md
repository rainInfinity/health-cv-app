# Android 开发与验证

## 首次构建与安装

在仓库根目录按锁文件安装依赖，然后在 `apps/native` 生成 Android CNG 宿主并构建、安装 development build：

```sh
# 仓库根目录
pnpm install --frozen-lockfile

# apps/native
pnpm expo prebuild --platform android --clean
pnpm expo run:android
```

`prebuild --clean` 会删除并重建生成的 `apps/native/android`。原生宿主配置应维护在 `app.json` 和 Expo config plugin 中，不要把生成目录里的手工改动当作唯一配置来源。`run:android` 使用已启动的 Android 模拟器或已连接设备。

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

## 验证记录与边界

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

