# android-app-foundation Specification

## Purpose

为 Android 应用提供可重复安装、编译和启动的工程基线，使后续测量与采集功能可以在经过验证的依赖组合上开发；本能力不代表采集业务已经实现。

## Requirements

### Requirement: Android 开发应用可启动
项目 MUST 提供可在 Android 模拟器或设备上安装并启动的开发构建，启动后显示 Hello World，且不依赖 Expo Go。

#### Scenario: 首次启动
- **WHEN** 开发者按项目说明从干净的依赖安装状态生成并构建 Android 应用，随后在 Android 模拟器或设备上启动
- **THEN** 应用成功打开并显示 Hello World，且不会因缺失原生模块或依赖冲突而在启动时崩溃

### Requirement: 已选依赖组合可共同构建
项目 MUST 锁定本阶段已确定的应用依赖及必要配套依赖的版本，并使同一锁文件下的 Android 开发构建成功完成；构建验证 MUST 包含已选原生依赖的链接，而不能仅以 JavaScript 包可解析为依据。

#### Scenario: 干净环境重建
- **WHEN** 开发者按项目说明使用锁文件安装依赖、重新生成 Android 宿主工程并执行开发构建
- **THEN** Android 构建成功，包含所安装的原生依赖，且应用能够安装并启动

### Requirement: 验证范围可辨识
项目 MUST 记录实际验证的构建命令、工具链与依赖版本组合，并区分应用依赖的构建通过和自研采集模块的功能验证。

#### Scenario: 查阅构建基线
- **WHEN** 开发者查阅 Android 构建说明
- **THEN** 能识别如何复现该构建，以及哪些原生依赖已纳入验证、哪些采集和业务功能尚未验证
