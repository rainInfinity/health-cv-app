# Design

## Context

仓库目前没有应用代码、包清单和原生宿主工程；架构文档仅定义目标组织。既定方向是 pnpm workspace、`apps/native`、Expo development build、Prebuild / CNG 和一组含原生代码的应用依赖，但未锁定任何可共同运行的版本。需求见 [规格](./specs/android-app-foundation/spec.md)。

## Goals / Non-Goals

**Goals:**
- 形成一个有锁文件、可复现 Android 开发构建的应用根基；在模拟器或设备上显示 Hello World。
- 验证选定依赖与同一 Expo SDK／React Native 版本组合的 Android 安装、编译、原生链接和启动，明确证据的边界。

**Non-Goals:**
- 不借 Hello World 实现采集 Hybrid Object、预览、业务状态、持久化偏好、导航页面、上传、健康指标或 iOS 构建。
- 不生成空功能包以迎合目标目录；不把安装 Nitro 核心库称作验证自研 Nitro 模块。

## Decisions

### 1. 以 Expo SDK 对应的版本组合为基线，而不是逐库采用最新版

从实际支持的 Expo SDK 模板开始确定 React、React Native、Android 工具链版本；使用 pnpm 安装建议兼容的 Expo 生态依赖，再逐项核对 Nitro、MMKV、文件库、导航原生 peer、styled-components v6 与该组合的支持要求。将直接依赖与必要 peer 明确记入清单，pnpm 锁文件入库，干净安装后重新构建。版本选择以实施时的官方兼容信息和实际编译结果为准，文档不预填未经验证的版本号。对重复 React／React Native 或原生依赖版本先查找真实冲突，不以全局强制覆盖掩盖不兼容。

替代方案是一次安装各库最新版；它无法保证满足 Expo SDK 和 Android 原生 ABI／Gradle 约束，因此不采用。

### 2. workspace 只包含实际存在的 App

根目录声明 pnpm workspace，应用放 `apps/native`。按 Expo 的 monorepo 支持方式配置 Metro；仅当锁定版本确有需要时加入额外解析配置。`measurement`、`acquisition`、`cloud-client` 的目录与入口待首次真实功能落地时再建立。应用入口保持最小 Hello World，不为尚无使用方的 Provider、导航或 bridge 创建空实现。

替代方案是立即建立三个空包和一套假采集对象；它只能测试占位代码，不能证明后续真实原生模块能够链接。

### 3. 原生依赖链接与业务模块接入分层验证

`apps/native` 安装所有已选应用依赖及其必须的原生配套。首次运行或原生依赖变化后，在 `apps/native` 下执行 `pnpm expo run:android` 生成、编译并安装 development build；检查实际构建解析到的原生模块和产出的安装包。已安装应用仅修改 JavaScript／TypeScript 时，在同一目录执行 `pnpm expo start` 启动 Metro，在终端按 `a` 于 Android 模拟器打开应用，观察 Hello World。Metro 只提供 JS bundle，不编译或更新原生二进制文件，不能单独证明依赖兼容。对于可独立、安全调用的 MMKV 和文件库，在实现阶段用短暂的开发期冒烟路径验证最基本的读写或创建／读取／清理，完成后删除检查代码；非原生依赖通过安装、解析及打包验证，不为此添加无业务价值的永久测试。Nitro 核心库能否随应用构建与自研 `acquisition` 的 Nitro Spec、Nitrogen 生成绑定及 Swift／Kotlin 实现能否工作属于不同证据；后者不在本变更内。

替代方案是只编译 Expo 默认模板；它不能覆盖用户指定的原生依赖组合。反过来实现假 Hybrid Object 作为验证，会提前引入占位采集接口，也不采用。

### 4. 宿主生成可重现，文档记录验证事实

保留 Expo 应用配置和锁文件作为 CNG 输入；必要的 Android 宿主定制用配置或插件表达，不依赖生成目录中的孤立手工改动。选择与项目约定一致的生成目录管理方式，并确保干净环境下可重建。`docs/development` 分别记录首次或原生依赖变更后的编译安装命令、已安装应用通过 Metro 启动的命令，以及 Android SDK／JDK／pnpm 等实际使用的工具链、锁定的依赖版本、实际验证设备或模拟器和未覆盖的自研采集与 iOS 范围。遇到兼容失败时调整可追溯的版本组合，不能通过忽略编译失败宣称通过。

替代方案是把生成的 `android/` 当唯一手工源码维护；这与既定 Prebuild / CNG 路线冲突，重新生成也无法稳定复现。

## Risks / Trade-offs

- [原生依赖同时安装导致 Gradle、Kotlin 或 New Architecture 约束冲突] → 先锁定 Expo 基线，再核对各库兼容要求；以干净安装、原生链接和实际启动决定组合是否成立。
- [Hello World 成功被误认为采集功能可用] → 验收记录明确区分第三方库链接、MMKV／文件库最小冒烟、自研采集未实现。
- [生成工程被意外手工修改] → 将必需配置保留在应用配置或插件，检查重新生成是否保留；执行可能删除现有生成目录的命令前核对用户改动。
- [本地 Android 工具链或可用设备缺失] → 实施时先核对环境；未完成模拟器或设备安装启动不得标记本规格通过，明确报告未验证项。

## Migration Plan

当前无既有应用或用户数据可迁移。实施时先建立 workspace／App 并锁定依赖，再生成 Android 工程、安装运行、记录基线；若版本组合失败，回到兼容版本选择，不保留有误导性的占位验证。项目文件的回退按本次变更范围处理，不删除与任务无关的用户文件。
