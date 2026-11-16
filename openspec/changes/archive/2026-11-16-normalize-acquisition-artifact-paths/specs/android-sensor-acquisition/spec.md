# Spec Delta

## MODIFIED Requirements

### Requirement: 文件持久且会话路径隔离

系统 MUST 在应用专属外部持久目录为每个源的每次会话分配独立临时与完成路径，拒绝覆盖已有文件。新传感器产物 MUST 使用 `getExternalFilesDir(null)/acquisition/<kind>/<sessionId>/<kind>.csv.part` 和对应的 `<kind>.csv` 完成路径，其中 `<kind>` 为 `accelerometer`、`gyroscope`、`magnetometer` 或 `gravity`，不再包含 `sensors/` 层级；血压 ACC MUST 使用相同的加速度计路径规则。停止、页面卸载、关闭其它源或进程退出 MUST NOT 删除已完成文件。完成列表 MUST 按类型仅返回当前进程已完成引用；进程重启后无扫描恢复时不得伪造旧引用或声称旧文件被删除。已有内部文件 MUST 保留，不自动迁移或删除；新位置不改变文件格式、定稿条件或原生记录边界。

#### Scenario: 同类型连续采集与进程重启
- **WHEN** 同一类型完成两次采集，随后进程重启
- **THEN** 两个文件路径不同且仍然保留于应用专属外部目录；新进程完成列表可为空，界面明确只查询本进程记录

#### Scenario: 四种传感器直接按类型组织
- **WHEN** 任一种支持的独立传感器创建新会话并正常完成
- **THEN** 临时文件与完成文件均位于 `acquisition/<kind>/<sessionId>/`，文件名分别为 `<kind>.csv.part` 与 `<kind>.csv`，完成引用返回新位置的绝对路径，不创建 `acquisition/sensors/` 中间目录

#### Scenario: 血压 ACC 沿用类型目录且保持独立标识
- **WHEN** 血压轮次正常定稿本轮 ACC 文件
- **THEN** 文件位于 `acquisition/accelerometer/<accSessionId>/accelerometer.csv`，仍使用 ACC 自己的会话标识，不改用 PPG 会话标识或业务轮次标识，也不新增陀螺仪文件
