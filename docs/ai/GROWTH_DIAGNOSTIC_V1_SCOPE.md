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
| 无模型定时扫描 | `ai/growth/monitorScheduler` + `monitor` | 原先单目标配置；覆盖拉新/激活/留存 |
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

## 启用方式（2026-10-28 简化）

日常操作只需在 **AI 分析 → 增长异常自动监控** 中开启当前账号。

- 定时任务随现有 HTTP 后端启动，使用已有 `node-cron`；无需单独 Worker、监控专用账号白名单或监控环境变量。
- 默认保持账号关闭。开启后，曼谷时间每天 10:30 扫描激活与回访两个已有日报目标（只读、零模型调用）。
- 启动前仍必须确保原有 AI PostgreSQL 迁移已完成（按已有安全迁移流程，禁止隐式写业务库）。
- 多副本使用现有数据库 scheduler health 租约互斥；告警继续由原有稳定 fingerprint 去重。
- 关闭页面开关即停止该账号后续扫描；后台进程日志以 `[growth-monitor]` 为前缀。
- 详细参见 [GROWTH_MONITOR_UI_TOGGLE.md](./GROWTH_MONITOR_UI_TOGGLE.md)。

## 测试证据与尚缺真实验收

GitHub PR #11 的 ai-contract、ai-integration（PostgreSQL + Redis）和 ai-frontend 应全部成功。
其中新集成用例 `growthDiagnosticE2eIntegration.test.js` 验证：完整日报、跨日下降、持久告警、提案去重、Inbox 单条审批、人为批准后的“等待派发”、跨用户隔离和零自动付费调用。
现有行动状态机、待复盘队列与调查时间线测试仍然是人工执行/复盘的权威实现，**不重复新建行动系统**。

生产环境数据质量、误报率、成熟 Cohort 比例、真实 AI 调查质量、部署进程是否运行，均需要独立观察，CI 测试不能代替。
