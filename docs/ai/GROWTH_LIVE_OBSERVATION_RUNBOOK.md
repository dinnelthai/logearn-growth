# Growth 真实运行观察 · V1.1（无额外进程 / 无付费 AI）

本次修改在已有 Growth 监控中增加**直接读取 Hologres 的观察模式**，不再要求事先生成 `ai_analysis_records` 的付费 LLM 日报。保留同一个页面开关、后端定时器、PostgreSQL 配置和告警去重。

## 数据流

每日曼谷时间 10:30：
1. 读取已开启的账号及最新事件水位。
2. 使用既有 `businessEvidence.fetchNorthStar` 在**同一原始快照截止时间**下，统计昨天和前天的 `active_users` / `new_users` / `returning_users`。
3. 仅当人数变化显著时，再按既有事件口径查询一次来源拆分，避免无意义的大查询。
4. 原始数据若未证实 `history_complete` 与 `events_complete_through`，则记录 `coverage-unverified`；展示实际观测值和渠道贡献**仅供排查**，**绝不**自动建立“真实下降”的业务告警。
5. 数据覆盖有明确保证且指标满足最小基数（20）、绝对变化（5）和相对变化（20%）条件时，才复用 `alertStore` 与 `investigationStore` 保存正式告警和待人批准的提案。
6. 告警记录的源端快照 ID、查询截止时刻和观察窗口可用于追溯；不是伪造的 `completed` AI 分析记录。人工批准前不触发模型费用。

每日摘要保存在原有 `ai_growth_monitor_settings.last_scan_summary`，不增加数据库表、任务队列或服务。网页会显示当天人数、相邻业务日变化、可用的渠道差额、质量限制和最近检查状态。

## 数据质量限制（重要）

现有 Hologres 的默认 `status()` 回应 `history_complete=false`、`events_complete_through=null`，因此**普通数据源通常只能给出观察性变化**；不能自动证明真实用户流失。**请不要**为显示绿色状态而硬编码这些字段为 true。只有上游事件完整性有独立且可信的保证后，才会出现正式已核验告警。这不是功能故障。

来源拆分也只是相邻日期内的分析人数，不是 Google 曝光或 SEO 点击，更不是因果归因。成熟 D7 留存与 24 小时激活率的自动异常比较仍需稳定的同口径入组分母，**尚未**在这版中自动启用。

## 开始跑数据

1. 部署新 `master` 的 Web 后端与前端，并确保已执行仓库现有的 AI PostgreSQL 迁移。
2. 在 **AI 分析 → 增长异常自动监控** 开启。无需启用 Daily AI 付费服务。
3. 后端每天 10:30（Asia/Bangkok）执行一次；观察页上次扫描时间和 `[growth-monitor]` 日志。
4. 至少记录 7 天，优先导出脱敏后的：每天两期人数、`dataQuality`、`status`、`changes[].bySource`、`reason`、首次异常与人工核查结果。
5. 复盘先查“采集延迟/范围错误”，再查 SEO/KOL/社群渠道和站内分析漏斗。不能把源端数据缺失当成没有用户。

若 `lastScanStatus=skipped` 且子项 `status=coverage-unverified`，表示数据仍可观察但**不能证明异常真实**。若 `status=error`，排查 Hologres 连通性、SQL 超时和账号数据库权限。

## 验收范围

- 单账号每天两天原始人数只读查询；两个目标共用一份业务观测结果。
- 未证明完整的数据不能写入正式告警。
- 已证明完整的下降可去重写入既有告警 / 人工审批提案。
- 无 LLM、无独立 Worker、无自动运营动作；既有 CI 测试覆盖开关、多实例租约、数据质量与主要异常门槛。
- GitHub CI **不能替代**真实 Hologres 连接、历史采集连续性、真实误报率或有效用户与注册口径的人工比对。
