# Spec Delta

## MODIFIED Requirements

### Requirement: 会话隔离且资源释放不删除产物
每次采集 MUST 在应用专属外部持久目录使用独立会话标识和 `ppg.csv`、`frame.csv` 文件路径；新 PPG 会话 MUST 保存于 `getExternalFilesDir(null)/acquisition/ppg/<sessionId>/`，两份 CSV 及其 `.part` 文件 MUST 位于同一会话目录，不再直接位于 `acquisition/<sessionId>/`。结束会话的迟到回调不得写入下一次采集。关闭相机或界面卸载 MUST 结束采集并释放运行资源，MUST NOT 隐式删除已经完成的文件；任一未完成文件不得冒充完成产物。已有内部文件 MUST 保留，不自动迁移或删除。

#### Scenario: 重复采集后旧回调到达
- **WHEN** 新采集已经开始而上一会话的迟到回调到达
- **THEN** 该回调不进入新文件，两个会话的记录和路径保持隔离

#### Scenario: 正常停止后关闭相机
- **WHEN** 文件已完成且用户关闭相机
- **THEN** 相机与队列资源释放，已经返回的文件仍然存在于应用专属外部持久目录

#### Scenario: 新 PPG 产物按信号类型组织
- **WHEN** 手动 PPG、产品指尖或血压轮次创建新的正式 PPG 会话
- **THEN** 临时文件为 `acquisition/ppg/<sessionId>/ppg.csv.part` 和 `frame.csv.part`，正常定稿后在同一目录形成 `ppg.csv` 和 `frame.csv`，完成引用返回对应绝对路径，文件格式与定稿条件不变
