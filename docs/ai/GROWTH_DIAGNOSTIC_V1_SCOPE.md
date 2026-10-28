# Growth Agent V1 · 诊断问题闭环（开发边界与差距）

跟踪：[#3](https://github.com/dinnelthai/logearn-growth/issues/3) · 分支：`feat/ai-autonomy-next`。

## 产品契约

- AI **发现**异常、核对来源水位、定位调查方向、保存证据/假设；运营负责人**决定具体运营方案**。
- 不做北极星月目标拆解、不生成自主周计划、不自动发布或修改运营预算。
- 新增用户指首次被观测到筹码分析的用户，不等于注册新用户；D7 仅使用成熟样本。
- 任何自动任务不得未经显式授权启动付费模型调查或执行外部操作。

## 优先复用（不新增平台）

| 用户能力 | 已有代码 | 需补齐的连接 |
| --- | --- | --- |
| 异常和数据质量判断 | `ai/growth/triage`, `crossDay`, `alertStore` | 多目标扫描与成熟样本约束 |
| 无模型定时扫描 | `queues/workers/growthAlertMonitor` + `monitor` | 原先单目标配置；覆盖拉新/激活/留存 |
| 深度调查与审批 | `planner`, `investigationStore`, `investigationTimeline` | 已观察事实、推测和数据不足分层展示 |
| 问题列表与去重 | `inbox`, `workspace/discovery`, `workspace/store` | 同一事件的优先级与关联入口一致 |
| 人工执行/结果复盘 | `actionWorkflow`, `reviewQueue`, `operationTasks` | 从问题进入人工行动、复盘可回溯 |
| 运营数据 | Hologres / 现有分析报告 | 不重新定义 KPI 或复制 PostHog |

## 关键差距

1. `growthAlertMonitor` 只扫描单个 `AI_DAILY_GOAL`，不能合理覆盖核心增长问题；若简单扫描多个目标，可能重复为同一人数指标创建多个跨目标告警。
2. `crossDay` 已有严格日界、水位和历史覆盖检查，但仅对三个人数指标出告警；`activation_rate` / `d7` 必须有成熟分母和同口径证据才能扩展。
3. `investigationStore` 与 `inbox` 已有审批与问题链路；不能新建平行问题数据库。
4. Growth Workspace 的数据质量问题与 PostgreSQL 告警是两种已有证据来源；V1 应在界面上正确注明来源，不假装二者自动双向同步。

## V1 验收与停止线

- 已有回归测试继续通过，新增多目标监控、去重、数据不足等用例；GitHub CI 全绿。
- 人工审批前无付费调用，且没有未经批准的外部动作。
- 人数告警不重复计入多个目标；缺历史、缺事件水位或时段不一致时拒绝告警。
- 业务日志可追溯至 owner、原始快照和异常期间。
- 没有真实标注异常样本时，不能宣称诊断准确率或业务提升，只能确认测试契约。
- 达到范围内验收即冻结 V1；另起 issue 才能新增需求。

## 启用方式和回滚（保持默认 OFF）

现有进程：`cd backend && npm run worker:growth-monitor`。
只有设置 `AI_GROWTH_ALERT_MONITOR_ENABLED=1` 才真正调度；`--dry-run` 只校验目标/用户配置，绝不查询或写入业务数据。
`AI_DAILY_OWNER_IDS` 是经过授权的账户列表；`AI_GROWTH_ALERT_GOALS=activation,retention` 可同时扫描核心目标。
不配置此新环境变量时沿用旧 `AI_DAILY_GOAL`；也未配置则默认检查 activation 与 retention。
`AI_GROWTH_ALERT_SOURCE` 可单独指定监控来源，未设置则使用 `AI_DAILY_SOURCE` 或 `all`。
继续用原有 Postgres 告警表和告警审批接口；不引入新数据库或模型供应商。

- 拉新：`new_users` 是首次观测到筹码分析，**不是新注册**；激活一侧同时监测 `active_users`。
- 留存：当前无人值守告警只对 `returning_users` 人数变化进行保守检测。D7 成熟留存率和 24h 激活率可在现有业务报告 / 人工批准的深度调查中查看，但尚未加入无人值守跨日比例异常判定，以避免不同 Cohort 的分母错比。
- 发现异常后写入原有 `ai_growth_alerts`、`ai_growth_investigation_proposals`；相同告警按稳定 fingerprint 更新，提案只能人工批准付费分析。
- 新增 `diagnosis` 仅提出应该核查的事实与问题，没有自动制定运营方案。
- 如监控造成错误：删除/关闭 `AI_GROWTH_ALERT_MONITOR_ENABLED` 即停止新扫描；已有告警不自动删除，需人工审阅。

## 测试证据与尚缺真实验收

GitHub PR #11 的 ai-contract、ai-integration（PostgreSQL + Redis）和 ai-frontend 应全部成功。
其中新集成用例 `growthDiagnosticE2eIntegration.test.js` 验证：完整日报、跨日下降、持久告警、提案去重、Inbox 单条审批、人为批准后的“等待派发”、跨用户隔离和零自动付费调用。
现有行动状态机、待复盘队列与调查时间线测试仍然是人工执行/复盘的权威实现，**不重复新建行动系统**。

生产环境数据质量、误报率、成熟 Cohort 比例、真实 AI 调查质量、部署进程是否运行，均需要独立观察，CI 测试不能代替。
