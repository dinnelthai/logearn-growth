# Growth Agent 接入梳理

日期：2026-10-27。依据当前工作区代码及定向测试；不是生产环境验收。本次仅新增梳理文档，不修改业务代码。

## 判断

已有增长数据计算、人工业务报告、异步 AI 分析和反馈复盘。AI 是有限工具的增长分析助手，尚不能调查整个增长系统。优先复用现有指标服务扩展调查范围，再做对话与持续监测。

此前已经验证 DeRouter 的 claude-sonnet-4-6 能通过现有 OpenAI provider 返回文本。该验证没有覆盖身份认证、业务查询、Redis 队列、Worker、AI PostgreSQL 存储及前端报告的完整链路。

## 当前能力与接入差距

| 能力 | 当前代码 | AI 接入情况 |
| --- | --- | --- |
| 北极星、本期与等长对比期 | businessEvidence、businessReport | 已进入初始证据，可补查 |
| 增长拆解、渠道激活、成熟 D7/D30、设备/版本变化 | growthInsights | 已进入增长证据；补查粒度有限 |
| 周核心与业务目标差距 | weeklyCore | 已进入初始证据，可补查 |
| 漏斗、行为路径、产品交易链 | funnel、pathInsights、productChain | 专用工具未接入 AI 调查循环 |
| 活动目标、固定名单、转化与效果 | activityMonitor、activityTargets、相关路由 | 未作为 AI 活动范围和调查工具接入 |
| 分群、用户标签、运营任务 | segmentInsights、operationTasks 等 | AI scope 仅支持 source，不能按活动或人群调查 |
| KOL 合作成本与收入记录 | collaborations、collaborationCosts/Revenue | 未作为 AI 成本收益调查工具接入 |
| 埋点审计、覆盖和数据质量 | trackingAudit、growth quality | 初始报告有部分质量提示，缺统一诊断工具 |
| 历史建议、拒绝原因、行动与复盘 | aiRecords、retrospective | 已有；按来源读取最近30条 AI 建议，相关性筛选有限 |
| 人工报告与行动历史 | businessReports、businessAnalysis job | 从指定业务报告发起 AI 时可带入人工行动与历史 |
| 知识库 RAG | ai/rag | 有独立模块，未接入当前业务分析任务 |
| 定时主动分析 | scheduler 明确停用 | 当前均人工触发；不是遗漏的运行故障 |

## 主要问题

1. 单模型切换后的前端文案、分析/复盘提示词、说明文档仍有国产模型与 Opus 残留。runner 仍识别 needsOpus。需要统一成一个模型，不应让用户误以为仍会换模型。
2. 旧测试没有同步单模型行为。本次 aiBusiness + businessReports 共17项：13通过，4失败。失败来自旧模型路由预期和 mock 缺 getConfig/openai 配置；不能据此断定线上服务失败，也不能把测试视为已通过。
3. Agent 调查只支持 north/growth/weekly；复盘仅 north/growth。业务服务已有更多能力，但模型无法调用。
4. validateScope 仅允许 source；活动、用户群参数会明确拒绝。不能声称已有活动/人群 AI 分析。
5. 排序集中在观测人数变化、渠道激活/回访缺口、周核心目标。conversion/revenue 没有完整对应的交易/净收入/投入收益排序体系。
6. 提示词要求可核对证据，但 validateAnalysis 主要检查结构，没有校验引用的指标值是否来自快照。自然语言 evidence 需要升级成证据ID引用。
7. 复盘可读取任意 validationMetrics，但实际 values 主要提供人数、激活与D7。交易、收入、周核心等可能被标为不可用，应建立指标能力注册表。
8. 单次上下文混入报告和最近历史，输入预算按字节保守估算。应按问题检索证据并分步补查，保留完整证据档案，避免上下文膨胀。
9. LLM 金额限制依赖配置费率；价格未知时无法实现可信金额预算。并发调用前检查不等于预留额度，失败请求计费与队列 stalled 重执行也应纳入幂等和审计设计。
10. 前端为一次性表单与历史报告，没有围绕一份证据快照连续追问、调查过程视图或取消机制。离开页面只停止显示轮询。

## 推荐实施顺序

### P0：先让现有链路稳定、准确

- 同步单模型文案、提示词、文档及测试，移除升级 Opus 的语义。
- 做一条登录用户真实业务分析验收：生成业务证据 → 入队 → Worker 调模型 → 保存报告和建议 → 前端读取 → 记录一次反馈。
- 展示数据水位、覆盖、排队/执行状态及可操作错误；检查 Redis、Worker、AI数据库和迁移，而不仅是模型 API。
- 根据服务商真实价格配置费率，价格未知时明确显示未知。

验收：关键回归测试通过；完整业务任务持久化成功；模型与证据来源可追溯；不会调用旧模型。

### P1：让 Agent 看见整个增长

- 接入受控只读工具：指标概览、漏斗、产品链断点、路径、留存队列、渠道质量、活动、人群、合作成本收益、埋点质量。
- 统一 source/activity/cohort、时间、快照与访问权限。每个工具单独校验能力和范围；不支持时返回明确结果。
- 每次工具输出包含 evidenceId、指标定义、分子分母、期间、快照、质量限制和可打开的报告定位参数。
- 输出统一为事实、假设、不确定性、下一项核查、建议行动、验证指标；服务器校验证据引用。
- 扩展复盘指标注册表，确保建议的验证指标确实能在复盘服务计算。

验收示例：能回答“哪个渠道带来新增但没有激活”“详情到真实成交卡在哪里”“某活动的成熟人群结果如何”，并打开对应证据。

### P2：把建议变成可管理的增长闭环

- 保存版本化业务背景：目标、资源、产品变更、活动日历、排除因素。
- 在已有运营任务基础上接入建议转人工任务，记录负责人、截止时间、目标人群、基线和实际行动；避免重复建设任务系统。
- 支持在同一报告上追问、显示调查过程和补查结果；历史记忆按问题/指标/范围检索。
- 接入对照组或实验结果后才评价增量效果；普通前后变化继续保留为观测证据。

### P3：再加入持续监测

- 在用户明确开启后，按数据刷新触发检查；先用规则检测水位、异常和样本，再决定是否调用模型。
- 只在重要变化时通知；配置频率、调用预算和停止开关。
- 建立离线评估题集：口径混淆、未成熟D7、交易未知、跨人群越界、旧建议重复、数据缺失等。

## 本次验证

- aiBusiness.test.js + businessReports.test.js：17项，13通过、4失败；未修改测试或业务代码。
- growthEvidence、productChain、trackingAudit、activityMonitor、activityTargets、collaborations、operationTasks：27项全部通过。
- 合计44项：40通过、4失败。均为定向本地测试，不代表全套测试或真实业务链路已验收。
- 未触发真实增长分析付费任务，未变更定时调度、数据库结构或线上服务。

## 核心代码入口

- backend/src/ai/business/runner.js：调查循环与任务预算。
- backend/src/queues/jobs/businessAnalysis.js：业务快照、历史与工具白名单。
- backend/src/services/businessReport.js：证据组装、人工复盘。
- backend/src/analytics/businessPriorities.js：指标口径、范围校验与排序。
- backend/src/queues/jobs/retrospective.js：AI复盘与经验。
- backend/src/db/aiRecords.js：建议、历史、持久化与权限范围。
- frontend/src/pages/aiAnalysis.js：现有AI入口及单模型遗留文案。
