# Design

## Context

动机见 proposal.md。现有输出接受 `File` 根目录，由 `AcquisitionPaths` 拼接会话路径，`AcquisitionFileStore` 在同一父目录提升文件或目录。只改变 Android 入口注入的根目录即可复用 CSV writer 和定稿屏障；RPPG 与历史视频另有磁盘扫描，须保留已有文件的查询。

## Goals / Non-Goals

**Goals:** 所有新采集产物统一写入应用专属外部目录，绝对路径引用和完整发布逻辑保持不变。

**Non-Goals:** 不使用公共目录、URI 接口或所有文件权限，不搬移旧文件，不改变 PPG／传感器的进程内列表寿命，不新增测试、构建、安装或真机采集任务。

## Decisions

### 只在 Android 存储边界解析外部根目录

在 storage 中提供统一的 Context 扩展，使用 `getExternalFilesDir(null)`，空值抛出明确的 I/O 错误。PPG、传感器、主动和被动 RPPG 均从此注入现有 `File` 参数，拒绝使用 `File(null, child)` 意外落到其它路径或回退 `filesDir`。不硬编码 `/sdcard`，不增加通用存储框架。

### 保留既有路径与发布实现

外部根目录下仍为 `acquisition/<sessionId>/`、`acquisition/rppg/<sessionId>/` 和 `acquisition/sensors/<kind>/<sessionId>/`。临时文件、RPPG 临时目录与最终位置在同一存储根下，继续使用现有重命名和关闭屏障；公开 `path` 字段仍是绝对路径，不生成 Nitro 接口变更。

### 新写外部，已有结果只读原位置

主动和被动 RPPG 查询合并外部与内部各自已验证的完整结果，按现有会话标识排序；两处保留真实文件引用，不复制文件内容。历史视频没有新生成路径，继续查询内部 `passive-capture`，不为目录迁移引入视频迁移或另一套历史恢复。PPG／传感器旧文件保持原位，仍可通过 Debug 的 `run-as` 读取。

## Risks / Trade-offs

- [外部目录不可用] → 明确失败，不静默改写内部目录；普通文件写入／关闭失败继续沿用现有错误合同。
- [把 Android/data 当作公共目录] → 文档和文案明确 ADB 取文件用途、普通应用访问受限及卸载删除；不承诺所有设备文件管理器都可访问。
- [未进行运行验证] → 用户明确要求不测试，本次只做修改结果及工件格式核对，不宣称构建、ADB 新路径或采集已运行通过。

## Migration Plan

新安装包启用外部根目录，新产物按原结构写入；已有内部文件原位保留。回退实现不会删除外部产物，但旧版本不承诺查询新外部结果。不执行搬移、删除、清数据或卸载操作。
