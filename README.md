# health-cv-app

## Android 开发与调试

环境：Node.js 24、pnpm 11、JDK 17、Android SDK。

首次安装、生成 Android 宿主并构建（从仓库根目录执行）：

```sh
pnpm install --frozen-lockfile
cd apps/native
pnpm expo prebuild --platform android --clean
pnpm android
```
`pnpm android` 会先运行采集包的 Nitrogen 代码生成，再调用 Expo `run:android`。

内部测试 release APK（先确保 Android 宿主已生成）：

```sh
pnpm android:release
```

产物位于 `apps/native/android/app/build/outputs/apk/release/app-release.apk`。该包使用调试签名，仅供内部测试。

后续启动 Metro（在 `apps/native` 执行）：

```sh
env -u CI NODE_OPTIONS=--dns-result-order=ipv4first pnpm expo start --localhost
```

Metro 启动后按 `a` 打开 Android development build。工具链版本、镜像配置与排错细节见 [Android 开发与验证](docs/development/android-development.md)。
