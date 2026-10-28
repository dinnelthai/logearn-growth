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
