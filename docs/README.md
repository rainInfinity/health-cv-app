# 文档索引

`docs` 维护现行说明、使用方法与明确的能力边界，不保存历次验收日志或调试截图。本文不把规划、演示或采集成功视为产品能力与医学有效性。

## 按任务阅读

| 需要了解 | 文档 |
| --- | --- |
| 产品目标、当前功能与指标开放条件 | [产品需求](product/product-requirements.md) |
| 技术选择、已实施与待定范围 | [技术选型](architecture/technology-stack.md) |
| 目录、模块职责和依赖方向 | [代码组织](architecture/code-organization.md) |
| Android 环境、构建、Metro、采集操作与文件核查 | [Android 开发](development/android-development.md) |
| UI、主题、组件、状态、查询缓存与语言 | [前端开发约定](development/frontend-development.md) |
| 测量业务流程、提示文案、结果规则与业务包目标 | [测量业务](development/measurement.md) |
| 凭据、恢复、刷新、退出与认证隔离 | [认证会话](development/native-auth-session.md) |
| 图标生成、SVG 与原生图形维护 | [原生图形](development/native-graphics.md) |
| SDK 方法、HTTP、文件传输与数据语义 | [云端请求接口](development/cloud-client-api.md) |
| 采集产物到模型输入的待确认映射 | [上传对接草案](development/acquisition-upload-protocol.md) |
| 独立浏览器设计演示、页面和模拟边界 | [设计 Demo](design-demo/README.md) |

## 采集协议

| 能力 | 权威说明 |
| --- | --- |
| 相机 PPG、配置冻结、DataHub、像素与双 CSV | [Android PPG](acquisition/android-ppg.md) |
| 主动 RPPG、模型、算法、实时展示与共用结果格式 | [Android RPPG](acquisition/android-rppg.md) |
| 被动服务、真实解锁与周期门控 | [Android 被动采集](acquisition/android-passive-capture.md) |
| 独立传感器、时间、单位与 CSV | [Android 传感器](acquisition/android-sensors.md) |

## 参考与维护边界

- [旧项目血压流程](architecture/nxhe-app-intl-bp-flow.md)仅作源码参考，不是本项目合同；[品牌概念预览](brand-preview.html)是概念展示，现行资源清单见 Demo 说明。
- [主题令牌总览](development/assets/health-theme-token-sheet.png)及其生成源保留为设计说明；数值以原生 `theme.ts` 为准，生成方法见前端约定。
- 架构写职责，选型写决策，采集写协议，开发写用法，产品写目标和开放条件；同一细节只在所属文档维护，其他文档引用。
- 当前实现、未来目标、模拟数据与待验证事项必须分开。整理文档不代表新增实现或完成验证。
- OpenSpec 规格与变更流程保留在仓库的 `openspec`，不在此复制历史工件；后端合同以 `health-service/docs/frontend-integration.md` 及后端 OpenAPI 为依据。
