# Proposal

## Why

项目目前只有架构文档，没有可运行的移动应用；既定技术选型尚未在同一套 Android 工程中完成版本锁定和编译验证。先建立可启动的工程基线，能在采集业务开发前暴露原生依赖和工具链冲突，而不提前实现尚未定义的测量协议。

## What Changes

- 建立 pnpm workspace 与 `apps/native` 的 Expo + React Native + TypeScript 应用，使用 development build 和 Prebuild / CNG 构建 Android。
- 安装已确定的应用依赖及必要配套依赖：React Navigation、Nitro Modules、react-native-mmkv、react-native-file-access、Nano Stores 及其 React/i18n/persistent 包、React Query、Axios、styled-components/native v6；锁定能共同构建的版本组合。
- 在 Android 模拟器或设备上安装并启动 Hello World，验证干净安装、原生依赖链接和实际运行；记录所验证的版本与环境，不将依赖安装等同于自研采集模块已可用。
- 仅创建运行上述应用所需的文件；不创建空的 `measurement`、`acquisition`、`cloud-client` 包，不实现采集、测量、上传或 iOS 构建。

## Capabilities

### New Capabilities

- `android-app-foundation`：Android 开发构建可重复编译、安装和启动的应用基线，以及本阶段选定依赖组合的验证边界。

### Modified Capabilities

无。

## Impact

影响根目录的 workspace 与锁文件、`apps/native` 应用及必要的构建配置，并在 `docs/development` 记录 Android 构建、启动和版本基线。引入多个原生库及其 Gradle／Metro 兼容风险；具体版本只能在实施时通过实际构建确定。既有架构文档的目标目录仍不是本阶段必须预建的目录清单。
