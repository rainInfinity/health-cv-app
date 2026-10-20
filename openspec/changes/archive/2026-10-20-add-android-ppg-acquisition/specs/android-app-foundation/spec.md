# Spec Delta

## MODIFIED Requirements

### Requirement: Android 开发应用可启动
项目 MUST 提供可在 Android 模拟器或设备上安装并启动的开发构建，启动后显示可手动操作的采集验证界面，且不依赖 Expo Go、登录或云端环境配置。启动展示采集入口 MUST NOT 自动打开相机或开始保存数据。

#### Scenario: 首次启动
- **WHEN** 开发者按项目说明从干净的依赖安装状态生成并构建 Android 应用，随后在 Android 模拟器或设备上启动
- **THEN** 应用成功打开并显示采集验证界面，尚未自动打开相机，且不会因缺失原生模块或依赖冲突而在启动时崩溃
