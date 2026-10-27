# LogEarn 全链路 AI 增长决策工作台实施方案

> **交给实施 AI：** 执行前先读取本文件、仓库 AGENTS.md（如存在）、`.agents/product-marketing.md`、`docs/ai/GROWTH_AGENT_DELIVERY_STATUS_2026-10-28.md`、`docs/ai/GROWTH_AGENT_ARCHITECTURE_PROPOSAL_2026-10-27.md` 及相关源码；核对当前 Git 状态与代码是否已更新。按任务顺序实施，每个阶段先验证再进入下一阶段。用户未要求提交或部署时，不自行提交、推送或发布。已有用户改动及 `output/x-follower-audit-2026-10-28/` 不可覆盖或纳入提交。
>
> 本文同时记录产品设计和实施计划。对实施过程中出现的产品重大歧义、第三方授权、预算及生产变更，应按现有用户授权处理；不要将本文中的设计建议伪装成已上线功能。

**基准代码：** `feat/ai-growth-agent`，审阅时 HEAD `7f74bbbf64b248f6e17047697ebd3c32f8b413f0`（2026-10-28）。执行者应重新获取和核对最新代码，基于新代码调整文件定位，不重做已有修复。

**目标：** 建立围绕本月目标，覆盖渠道内容、获客、注册与激活、留存、交易价值、推荐、活动和 KOL CRM 的 AI 增长决策工作台；AI 可自主调查、针对业务信息提问、产生建议并跟踪执行与复盘，输出彼此关联的日报、周报和月报。

**架构：** 采用 LangGraph.js 承担 Agent 调查流程、持久状态及中断恢复；保留既有 Express、Bull/Redis、Hologres 业务计算、PostgreSQL AI 持久化和 Promptfoo。通过受控工具复用业务服务，保留 owner 范围、来源、数据水位、证据、付费调用防重与预算；框架不直接执行任意 SQL，也不改写正式业务指标。

**技术栈：** Node.js >=22.5、现有 CommonJS 后端、Vite 前端、LangGraph.js（实施时验证当前稳定版本及 Node/CommonJS 兼容性）、PostgreSQL 持久检查点、Bull/Redis、Promptfoo、既有 DeRouter 模型接入。无需先引入第二套编排或消息队列。


## 0. 产品优先级修订：先发现问题，再逐步闭环

**用户已确认：** Growth 覆盖内容与渠道、拉新、转化、留存、推荐、KOL CRM、活动和交易；AI 围绕本月目标持续发现业务问题。数据不足、采集异常、归因不明和身份无法关联本身也是问题，应进入同一问题池，而不是因为无法得出业务结论就忽略。用户主动提问不需要与北极星直接绑定。

**第一版定位：** 月度目标驱动的问题发现与决策工作台。先交付目标设置、业务/数据问题发现、用户提问、证据下钻、调查与人工待办；在有足够数据和执行事实时补充复盘。全链路是产品范围，首版主动调查优先覆盖用户转化与留存、X/渠道内容、推荐人和 KOL CRM；其他领域既有分析可查，数据接通后纳入主动发现。不要因首版聚焦而隐藏用户主动提出的其他增长问题。

**问题池至少包括：**

- 业务表现问题：有足够证据的目标差距、漏斗下降或回访变化，列出观察范围、分子分母和比较基线；变化不等于因果。
- 数据质量问题：事件漏报、身份无法关联、数据水位延迟、来源缺失、采集范围不足、接口失败或指标口径不一致。列出缺口、受影响问题、可验证证据、建议核查方和状态；没有覆盖证据时写“覆盖未知”，不能推定故障。
- 待调查假设：有初步线索但无法确定原因的问题，明确标注假设与待核查证据；不因缺证据禁止记录，也不能写成既成事实。
- 用户主动问题：直接进入问题池，允许未关联目标；已有答案和上下文应复用，不重复提问。

**去重与优先级：** 按 owner、问题类型、对象、范围和近期证据指纹合并重复发现；保留每次观测及状态变化。优先级结合本月目标关联、影响范围、数据可信度、紧急程度与修复/调查成本；不能观测影响人数时显示未知。重复且未变化的问题保留可见但不每日重复通知。新建、持续、已解决、无法确认分开；需要业务判断时说明为什么问和答案如何影响决策。

**日报/周报/月报第一版：** 日报展示月目标、变化、已有问题与行动状态；无新重要变化时如实说明，可展示持续的数据问题但不伪装成新发现。周报聚合本周问题与行动，不简单堆叠日报；月报汇总目标版本、全链路可用事实、数据缺口和后续决策。渠道未接入、关键来源缺失等数据问题进入相应报告。仅在观察成熟且有执行事实时做效果复盘，不要求第一版保证因果证明。

**交付顺序：** 先完成问题发现与目标工作台，再逐项打通转化、渠道、推荐/KOL 工具，随后增加任务执行、复盘与更强自主优化；框架替换以一条真实问题流程验证，保持旧路径可回退。不得以问题池为空、报表缺少数据或一条假设为由宣称增长健康。

**首版验收：** (1) 用户设置月目标后，系统可发现至少一个有证据的业务变化和一个可复现的数据缺口；(2) 数据缺口卡片显示受影响判断、证据、责任/下一步和状态，不声称缺失数据为零；(3) 用户提问可启动研究并看证据；(4) 当没有新变化时日报明确说明并保留未解决问题；(5) 同一缺口持续存在时不产生大量重复问题或通知；(6) 各平台或业务源未接入时显示未知及接入状态。

## 1. 产品要求

### 1.1 用户和核心体验

使用者是 LogEarn 负责人、增长和运营人员。第 0 节为首版范围及优先级，后续阶段性任务不要求在首版全部完成。用户设置本月北极星目标及辅助目标、期限、预算/人力约束；AI 在可用数据和预算范围内主动观察、提出或接受问题、调查、生成可执行建议、等待业务回答并在观察期结束后复盘。用户也可直接提问或要求排查推荐人、某个渠道、人群或 KOL；此类问题不必强行绑定北极星，但应说明与现有目标的关系。

必须覆盖的研究领域：

1. 渠道内容与平台曝光、互动：官方 X、博客、YouTube，以及将来的渠道。
2. 拉新：有证据的来源、到站、注册；未知来源独立保留。
3. 首次使用、激活、转化：首次有效分析、路径、漏斗、登录与邀请转化。
4. 持续使用与留存：成熟用户队列、四日核心目标、跌出和回流的观测。
5. 交易和价值：真实交易用户及交易量；交易量不等于收入，缺失净收入不可补零。
6. 推荐：推荐人、被推荐人、后续有效分析、回访和交易；推荐绑定不自动等于新增获客。
7. KOL CRM 和活动：合作、跟进、内容、用户表现、成本与各币种经济数据。
8. 采集质量和证据覆盖：首访缺失、事件漏报、身份关联、源水位、窗口成熟度。

### 1.2 日、周、月工作节奏

- 日报：前一个已完成 UTC+7 业务日，相对当前月份有效目标的进度、重要变化、问题、待回答问题、今天建议行动及已到观察期的复盘；不得因为补查失败生成假零。
- 周报：默认 UTC+7 周一 00:00 至下周一 00:00 的已完成自然周；回顾渠道、内容、转化、留存、推荐、KOL/活动及执行结果，与对应目标和前一完整周对照。可用数据的完整性不同，不能为凑齐版面发明数据。
- 月报：上一个已完成的 UTC+7 自然月，记录当月实际生效的目标版本、完成情况、各增长环节表现、行动复盘、资源成本及下月建议；不能把月中变更后的目标回溯覆盖上半月。
- 数据按 UTC+7 业务日；其他平台日历时区须单独标注，不伪装为相同口径。每份报告持久化 period、目标版本、证据 ID、水位、覆盖状态和生成版本；报告重放时不得静默刷新历史事实。
- 优先在产品内展示；外部发送仅在用户明确授权并配置后进行。本任务不自动发送消息或发布内容。

### 1.3 目标与状态

目标包含 `owner_id, id, metric_id, definition_version, target_value, unit, direction, period_start, period_end, timezone, scope, resource_constraints, version, effective_at, status`。通过版本链修改：新版本从生效时刻开始，旧版可查；同一 owner/目标/生效区间不得存在冲突版本。支持北极星与辅助目标，月中快照必须保留当时生效版本；已存在的 2026-11-30 四日核心目标是业务背景示例，不应硬编码成所有用户默认值。

不要把“月底目标”机械映射为每日目标。对于非累加的滚动指标（如近 7 天有 4 个不同日有效分析的用户数），每日显示当前观测和目标差；若无明确趋势模型，不预测预计达标日期。目标达成、分母、样本和覆盖分别呈现。

问题状态：`open → investigating → waiting_input / ready → action_linked → observing → reviewed`，可 `dismissed`，失败和取消另存运行状态。用户问题、自动发现的问题和数据质量问题都可进入问题池；去重以 owner、问题指纹、范围、目标版本和证据窗口为依据，重复发现应合并并保留新证据，不得跨 owner 合并。

建议/行动必须记录负责人、是否执行、执行时间、基线、主指标、观察期、范围、数据来源和结果；“已接受”不等于“已执行”，“执行后变好”不自动等于因果增量。AI 必须将事实、假设、建议和无法判断分别展示。

### 1.4 AI 提问和权限

只有无法通过已授权事实、已提供的业务背景或已有用户回答解决时，才提出业务问题。提问包含 `question_id, question, reason, impact_on_decision, blocking, status`；非阻塞问题不能阻止其他调查。回答持久化并归属 owner / 问题；恢复前验证该用户有权回答。控制台支持查看、回答和恢复，不重复询问已回答的问题。

默认允许：在授权范围内只读、制定研究、生成草稿及复盘。实际外部发帖、私信、用户权益、正式指标定义、生产配置和真实预算变更需要明确的对应授权及既有执行门禁；不要自动对真实用户实施实验。用户要求自主不意味着无限预算或绕过权限。

## 2. 当前状态与实施边界

| 功能 | 当前代码证据 | 真实状态 / 缺口 |
|---|---|---|
| 增长分析页面 | `frontend/index.html`, `backend/src/analytics/` | 已有北极星、漏斗、渠道、留存、路径、交易、推荐，生产数据覆盖待核实 |
| 用户和运营 | `backend/src/routes/userOperations.js`, `backend/src/routes/crm.js`, `backend/src/routes/activities.js` | 用户、活动、KOL 与运营待办各有实现，尚需统一问题/行动关联 |
| 官方渠道 | `backend/src/routes/contentGrowth.js`, `backend/src/services/followerAudit.js` | 内容以手工登记为主，关注者第三方数据和关键词初筛；真实平台同步与站内归因未证实 |
| AI 调查 | `backend/src/ai/business/runner.js`, `backend/src/ai/business/tools/registry.js` | 有自写多轮调查与证据工具，需迁移至框架；现有权限与安全机制必须保留 |
| 目标/日报 | `backend/src/ai/growth/agentScore.js`, `daily.js`, `agentBrief.js` | 已有日报与部分目标，现有评分面向单日，不能直接声称支持月度目标管理 |
| 研究发现和启动 | `backend/src/ai/growth/researchQuestions.js`, `backend/src/routes/growthAgent.js` | 问题可批准并显式触发付费调查；与自动闭环连接尚不完整 |
| 复盘与候选 | `backend/src/ai/growth/agentLearning.js`, `backend/src/ai/optimization/` | 基于已执行复盘调整重点，Promptfoo 评测入口和安全回滚存在；真实业务评测和自动效果优化未验证 |
| 周报/月报 | 现有每日 agent 及其他报告模块 | 未在本次审阅确认完整的目标驱动周报、月报，不可声称已有 |

现有修复：内容/粉丝专项入口、UTC+7 内容日期、部分无付费调用失败重试、研究批准后的显式 dispatch、可选有限粉丝自动分批及技术性 canary 回滚均已落地。`docs/ai/GROWTH_AGENT_DELIVERY_STATUS_2026-10-28.md` 较早段落可能被末尾修订覆盖；以实际代码和末尾时间更近记录为准。

## 3. 总体技术方案

### 3.1 职责与替换边界

- LangGraph 管理一个增长研究实例的图状态、工具步骤、checkpoint、等待回答及恢复。初期一个 Agent + 多个受控工具，不构建多 Agent 系统。
- Bull 承担计划触发、排队、延迟到观察期和 worker 调用；LangGraph 持久 checkpoint 选择 PostgreSQL，不能使用进程内 MemorySaver 作为生产持久化。检查点 `thread_id` 与 owner、problem、run 绑定，服务端授权，不信任客户端提交的完整状态。
- 保留 `backend/src/ai/business/tools/registry.js` 的权限、范围、数据契约及证据归档；LangGraph 工具只包装这些服务，新增推荐工具遵循同一契约。不得通过内部 HTTP 绕过权限或把所有用户明细放进模型上下文。
- 保留 PostgreSQL 付费调用 fence、取消、owner 隔离、版本化 prompt、token/时间/查询限制；从 LangGraph checkpoint 自动重放不代表外部支付安全。对“请求结果未知”的付费调用，保留未知状态并禁止自动重放；对外副作用设置幂等键和经授权的业务执行器。
- 保留原 runner 作为默认回退与历史运行恢复路径。两者共享只读工具及业务数据，但同一生产问题不得由两套执行器同时发起重复收费或外部动作。新旧影子运行须使用独立 run ID、单独预算和清晰标签；影子模式只读，且不对运营发通知。
- 旧运行按原 runner/原提示词版本恢复；新运行按固定框架版本和检查点 schema 恢复。严禁直接将旧 journal 解释成 LangGraph checkpoint。迁移采用新运行切换，历史数据只读可查。
- SQLite 当前保存内容和关注者状态，PostgreSQL 保存 AI 记录；跨库不可假设单事务。验收 API 与 worker 是否实际共享 SQLite 文件及备份；若跨主机则先设计独立迁移、验证、回滚，不在功能任务里强行更改生产拓扑。

### 3.2 核心接口建议（实施前核对已有类型和命名）

```ts
type Evidence = { id: string; ownerId: string; metricId: string; definitionVersion: string;
  period: { start: number; end: number; timezone: string }; scope: object;
  value: unknown | null; numerator?: number | null; denominator?: number | null;
  sourceVersions: object; watermarks: object; coverage: object; warnings: string[]; reportLocator?: object };
type ResearchInput = { ownerId: string; problemId: string; runId: string;
  goalVersionIds: string[]; scope: object; period: {start:number; end:number; timezone:'Asia/Bangkok'} };
type ResearchResult = { runId:string; state:'waiting_input'|'complete'|'failed'|'cancelled';
  evidenceIds:string[]; facts:object[]; hypotheses:object[]; recommendations:object[]; questions:object[]; warnings:string[] };
```

最终字段名以项目既有 API 和 migration 为准，但不得丢弃证据范围、目标版本、来源/水位、未知状态和 owner。单个证据出现跨期或跨源差异，需显式展示，而不是宣称是强一致快照。

### 3.3 研究图

`load_goal_and_context → check_quality → plan → tool_loop → evidence_validation → question_or_result → persist`。等待用户输入使用框架中断机制；完成后链接行动与观察期，后续复盘由 Bull 调度新运行或恢复已定义工作流。所有轮次、最大查询、扫描成本、延迟和模型费用均需预算；确定性查询去重，信息不足/预算耗尽允许以未知结束。

来源内容和用户反馈视为不可信数据，不允许改变 system 指令、授权、预算或工具白名单。不得输出无来源的增长结论；无法证明来源/身份时仅展示关联，不宣称因果。

## 4. 实施任务与验收

### T0 基线和真实环境核对

**读取：** `backend/src/index.js`, `backend/src/db/connection.js`, `backend/src/db/aiPool.js`, `backend/src/queues/queues.js`, `backend/src/ai/business/runner.js`, `backend/src/ai/growth/agentAutonomy.js`, `docs/ai/GROWTH_AGENT_DELIVERY_STATUS_2026-10-28.md`。

- [ ] 记录 Git HEAD、服务配置是否启用（不输出密钥）、API/worker/Redis/PostgreSQL/SQLite/Hologres 拓扑、可用源水位及是否共享 SQLite。
- [ ] 运行下列离线测试并记录通过/失败/跳过；记录环境缺失，不把未运行视为通过：
  `cd backend && node --test test/growthAutonomyRunner.test.js test/growthPlanner.test.js test/contentAgentEvidence.test.js test/followerBatchSafety.test.js test/researchQuestions.test.js test/promptRegistry.test.js test/canarySafety.test.js`。
- [ ] 选取脱敏的真实或经业务方审阅的评测案例：月目标进度、渠道不完整、首次分析失败、未成熟 D7、推荐绑定非获客、KOL 成本缺失、交易额非收入、X 曝光非转化、用户主动提问、提示注入、模型调用状态未知。记录证据范围与预期行为；无真实数据时标为待验证。
- [ ] 验收：形成环境差距清单与基线测试结果。只读核对，不启用付费功能，不更改生产数据库。

### T1 目标版本与月度进度

**建议文件：** 扩展 `backend/src/ai/business/context.js`, `backend/src/ai/business/metricRegistry.js`、相关 migration；复用 `backend/src/ai/growth/agentStore.js`、`backend/src/routes/aiAnalysis.js` 和 `frontend/src/pages/growthAgentControl.js`，不新增第二份未经映射的目标真相。

- [ ] 先写测试：同一目标月中修改保留历史版；非累计 rolling metric 不相加；owner 隔离；无可用值/未成熟为未知；UTC+7 跨月；无目标不显示达标。
- [ ] 增加版本化月目标及约束的保存、读取和有效版本解析；明确定义旧目标映射与升级策略，不默认覆盖现有目标。
- [ ] 页面可设置/查看目标、单位、目标方向、期间及当前差距；旧 API 保持兼容或提供明确迁移路径。
- [ ] 验收：同一目标在 10 月 15 日修改后，10 月 10 日报告仍引用旧版、10 月 20 日引用新版；可在报告中找到其依据。

### T2 统一问题、提问、行动与复盘

**建议文件：** `backend/src/ai/growth/researchQuestions.js`, `actionWorkflow.js`, `investigationStore.js`, `agentLearning.js`, `backend/src/routes/growthAgent.js`, `frontend/src/pages/growthAgentControl.js` 和对应迁移/测试。

- [ ] 先写测试：用户提问不要求绑目标；同 owner 同证据窗口去重；不同 owner 不合并；问题被回答后可恢复；执行、接受和复盘状态不能互相冒充；拒绝跨 owner 读写。
- [ ] 增加问题来源、目标版本、证据、状态、阻塞问题和回答；保留已有研究审批及 dispatch 兼容行为，提供用户主动创建与查询问题入口。
- [ ] 复用已有运营任务和复盘实体，建立问题/调查/建议/行动/复盘之间稳定 ID；追加操作历史，不把“批准研究”当作“已执行建议”。
- [ ] 验收：用户提出“排查推荐人”，不关联目标也能产生问题；AI 可提出业务问题、用户回答后继续，最后建议可进入人工任务。

### T3 LangGraph 并行接入与替换边界

**建议新增：** `backend/src/ai/graph/`（图、状态、工具适配、持久检查点及入口），测试 `backend/test/growthGraph*.test.js`。修改 `backend/src/queues/jobs/businessAnalysis.js`、`backend/src/queues/workers/aiAnalysisWorker.js` 的执行器选择；旧 `backend/src/ai/business/runner.js` 保留到 T8 验收。

- [ ] 在隔离环境验证 LangGraph.js 稳定版本、PostgreSQL checkpointer、CommonJS/ESM 和现有 DeRouter 的真实工具调用及结构化输出兼容；版本固定在 lockfile。若不兼容，记录失败并选择成熟适配器或模型，不能绕过工具验证。
- [ ] 先写测试：owner 授权、checkpoint 恢复、取消、重复消息、预算耗尽、未确认付费调用不重放、工具失败返回未知、提示注入和同一问题并发防重。
- [ ] 按 3.3 实现图；调用保留 `registry.executeTool` 与现有证据服务；检查点、run、owner、目标版本及 prompt 版本可关联。
- [ ] 引入显式执行器开关，默认沿用旧 runner；影子模式分别记录预算、run ID，禁止对外通知或外部修改。不要让两套执行器同时对同一问题产生运营动作。
- [ ] 验收：同一问题执行中重启后按原图版本恢复；至少 3 个只读业务工具的证据可打开；旧任务依旧按旧 runner 恢复，历史可见。

### T4 全链路工具及数据接入

**建议文件：** `backend/src/ai/business/tools/registry.js`, `adapters.js`, `contentAdapters.js`，`backend/src/analytics/referralInsights.js`, `backend/src/analytics/referral.js`, `backend/src/ai/growth/kolReader.js`, `backend/src/services/followerAudit.js`，及 `backend/test/agentTools.test.js`、`contentAgentEvidence.test.js`。

- [ ] 先写工具测试：推荐人明细和被推荐用户归属一致且过滤自邀；未绑定 X 用户为未知；关注关系不推断获客；样本截断和数据水位独立；不同币种/渠道曝光不相加；交易额不表示收入；历史快照与新水位不混淆。
- [ ] 包装既有转化、路径、留存、推荐人、KOL/活动、交易、渠道内容、关注者与数据质量能力；明确每个工具输入 schema、owner、范围、时间、最大结果、返回证据、缺失和报告定位。
- [ ] 内容采集先实现能力/状态和可用证据；官方 X、博客、YouTube 的真实连接分别根据部署环境与授权验证，支持不可用和人工导入。新增平台不改变统一的数据契约。
- [ ] 将内容专属链接参数和产品端来源、注册、有效分析关联；博客站内阅读与外部渠道到站分开。用户主动绑定的平台 ID 只表示身份匹配，不直接证明来源。
- [ ] 验收：一个用户转化调查、一个推荐人调查、一个 X 内容调查都能获取可追溯证据；缺乏身份/来源/交易数据时能明确说明不能判断。

### T5 日报、周报、月报

**建议文件：** 扩展 `backend/src/ai/growth/daily.js`, `agentBrief.js`, `agentStore.js`, `backend/src/queues/workers/growthAutonomyScheduler.js`, `backend/src/routes/aiAnalysis.js`，新增周期报告服务与对应 migration；前端接入 `growthAgentControl.js`。

- [ ] 先写边界测试：UTC+7 周/月切换、闰年、月中目标版本、重复调度、跨期去重、未成熟 D7、来源缺失、空期、报告不可静默改写；日报/周报/月报引用同一问题、行动和证据。
- [ ] 抽出统一 period factory 和 idempotency key：`owner + report_kind + period + goal_version_set + report_revision`；重复执行只更新允许更新的草稿，已发布报告要产生显式新版本，保留旧版本。
- [ ] 日报基于当前月目标与前一完整业务日；周报基于前一完整自然周；月报基于前一完整自然月。关联目标差距、优先问题、建议执行及成熟复盘；缺少数据时保留未知。
- [ ] 展示生成状态、目标版本、证据覆盖和每条建议的下钻；新报告可与旧报告并存，对 AI 不可用时保留业务分析页面。
- [ ] 验收：一次月中目标调整后，日报、周报、月报能准确引用对应版本并追踪同一行动；全周期时区及重试测试通过。

### T6 执行、观察和自主学习

**建议文件：** `backend/src/ai/growth/actionWorkflow.js`, `agentLearning.js`, `experienceFeedback.js`, `agentForecast.js`, `backend/src/ai/optimization/promptRegistry.js` 和现有评测脚本。

- [ ] 先写测试：建议未执行不进入效果判断；时间窗口未成熟为未知；负向指标下降可算改善但不能固定以“大于”为改善；无对照的前后比较不宣称因果；结果来源/分母不一致不得合并。
- [ ] 观察期由行动实际执行时间决定；按指标方向比较基线和结果，记录成熟度、混杂因素、数据覆盖和证据；结果为支持、未观察到改善或不足。
- [ ] AI 可自主更改下一次调查侧重点或提出策略候选，但不能自行修改正式业务口径、评测规则、预算或上线提示词；保留候选→独立评测→授权→灰度→回滚流程。
- [ ] 用 Promptfoo 运行独立留出案例，对比旧/新版本的证据正确性、工具选择、未知处理、注入防护、时延和费用；模型自评不作为唯一依据。真实模型运行需要明确预算和生产隔离。
- [ ] 验收：同一行动从建议、人工执行到观察完成，复盘可追溯，下一轮研究确实读取该结论；无数据时不做有效/无效结论。

### T7 发布准备与真实 E2E

- [ ] 在隔离或明确授权的环境应用 migration（包含备份、回滚和版本兼容说明），核对 Redis 持久化、checkpoint 数据库、服务重启和多 worker 拓扑。
- [ ] 核对第三方数据授权、API 额度、费用；保留当前 X 共享预算，AI 除调用轮数外补可核算的全局费用策略，价格未知时不能称为 USD 硬上限。
- [ ] 做真实非合成链路：目标 → 用户问题 / 发现 → 至少三种业务证据 → 调查 → 提问/回答 → 建议 → 人工执行记录 → 数据成熟 → 日/周/月报告和复盘。验证模型提供方、owner 权限、数据水位与日志，不在日志泄露密钥和不必要的用户资料。
- [ ] 运行相关后端、前端测试和生产构建；执行真实 Promptfoo 留出集对照并保存脱敏结果；现有 `backend/scripts/verifyGrowthAgentE2E.js` 是辅助验证，不等于完成整条链路。
- [ ] 真实 E2E 未通过时保留旧 runner 为默认，清楚报告阻塞项；生产发布须依用户授权与部署流程执行。

### T8 切换、回滚和删除旧编排

- [ ] 在新旧运行均满足相同权限和预算的前提下，对同一固定输入执行只读对照，记录证据正确性、未确认调用、完成率、响应时间、成本和人工可操作性；影子结果不发送给外部用户。
- [ ] 分 owner 切换新运行，新旧运行不共享执行权；正在运行的旧任务继续由旧版本恢复；新任务失败可通过配置回退为旧 runner，不回滚业务事实或历史记录。
- [ ] 达到约定评测阈值且完成真实故障演练后，删除框架已接管的自写循环、重复状态恢复代码；保留业务授权、付费防重、证据及历史审计。变更前建立依赖清单和可恢复版本。
- [ ] 验收：新路径默认运行并可回退；不再同时维护两套生产新任务执行逻辑。不要仅凭构建成功删除旧实现。

## 5. 全局验收和交付格式

- 每项任务按测试先行：写能证明行为的失败测试 → 运行确认失败 → 最小实现 → 运行目标测试；不得以 mirror implementation 的测试充当端到端证据。
- 系统可用与生产已部署分开报告。列出每个阶段完成/未完成、测试命令及结果、实际数据源、尚需授权或部署的事项。
- 代码可在用户请求时提交；本文不授权提交、推送或部署。不要提交第三方原始关注者数据、密钥、模型输入中的敏感信息或本地采样文件。
- 模型数据缺失和费用不确定时返回未知/不可评估；对外发帖、联系用户或修改权益必须依据明确授权。
- 最终至少演示：月目标、日报/周报/月报、用户主动问题、用户转化、推荐人下钻、X 内容与粉丝、KOL CRM、人工行动、成熟复盘，以及中断恢复和可追溯证据。

## 6. 框架参考与版本核对

- LangGraph.js 状态、检查点和人工中断：https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph
- Promptfoo 评测与对抗测试：https://www.promptfoo.dev/docs/intro/
- Bull 与 BullMQ 迁移（未来有必要时，建立新队列并排空旧队列）：https://docs.bullmq.io/guide/migrations/bull-to-bullmq
- 执行时重新查阅官方文档，核实当前包版本、PostgreSQL checkpointer、部署要求、许可证和 DeRouter 的实际兼容性；文档中的示例 MemorySaver 不是生产持久化方案。
