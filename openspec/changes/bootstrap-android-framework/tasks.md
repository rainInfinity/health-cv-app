# Tasks

## 1. Workspace 与最小应用

- [ ] 1.1 建立根目录 pnpm workspace 和 `apps/native` 的 Expo／React Native／TypeScript 应用；核对安装后包解析正常且入口仅显示 Hello World，不生成三个空功能包。
- [ ] 1.2 配置 development build、应用级配置与 Android Prebuild 输入；验证生成的宿主工程能够由应用配置重建，不把手工修改作为唯一配置来源。

## 2. 已选依赖与兼容基线

- [ ] 2.1 依据 Expo SDK 的匹配版本安装 React Navigation 及必要原生 peer、Nitro Modules、react-native-mmkv、react-native-file-access、Nano Stores 相关包、React Query、Axios 和 styled-components/native v6；核对直接依赖、peer 及锁文件中的 React／React Native 版本没有实际冲突。
- [ ] 2.2 从锁文件执行干净安装并生成 Android 宿主工程，在 `apps/native` 下使用 `pnpm expo run:android` 构建、安装 development build；检查 Android 原生模块解析／链接结果和构建产物，失败时调整兼容版本后重跑，不用排除已选依赖换取表面通过。

## 3. 运行验证与开发说明

- [ ] 3.1 在已安装 development build 的 Android 模拟器上，从 `apps/native` 运行 `pnpm expo start`，按 `a` 打开应用，观察 Hello World 和启动期间的原生模块错误；针对 MMKV 和文件库完成短暂的实际读写／文件创建读取清理冒烟，随后移除临时检查代码并确认应用仍能启动。Metro 启动成功不能替代原生构建验收。
- [ ] 3.2 在 `docs/development` 分别记录首次原生编译安装和后续 Metro 启动的命令，以及实际版本、JDK／Android SDK／pnpm 环境、验证设备和验证边界；按文档命令复现构建与启动，明确自研 Nitro 采集及 iOS 未验证。

## 4. 跨步骤复现

- [ ] 4.1 从锁文件和可再生配置重新生成 Android 宿主工程并完成编译、安装、启动，确认最终状态仍显示 Hello World 且已选原生依赖仍参与构建；记录任何无法验证的环节，不将其标为完成。
