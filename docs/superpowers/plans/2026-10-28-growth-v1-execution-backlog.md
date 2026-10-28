# LogEarn Growth 第一版实施任务清单

> 面向实施 AI。先读本清单及下方合并的设计方案、`.agents/product-marketing.md`、`docs/ai/GROWTH_AGENT_DELIVERY_STATUS_2026-10-28.md`，以及适用的 AGENTS.md。以最新代码为准；本清单审阅基准为 `7f74bbbf64b248f6e17047697ebd3c32f8b413f0`。执行前检查 Git 状态和已有用户改动；不要覆盖或提交本地关注者原始采样数据。不要因本清单自行提交、推送、部署或启用付费/外部动作。

## 目标和范围

建立一个**月度目标驱动的问题发现与决策工作台**。AI 和用户均可提出问题；业务表现问题、数据质量缺口、待验证假设都是问题。第一版主动覆盖用户转化/留存、X/渠道内容、推荐人和 KOL CRM；用户可提其他 Growth 问题，不强制绑北极星。系统提供可追溯证据、影响和下一步，不把未知数据写成零。

优先实现可用闭环：月目标 → 发现问题（含数据问题）→ 用户/AI 调查 → 可核查结论 → 人工待办 → 跟踪结果；日报围绕本月目标及未解决问题。周报/月报先做基于同一对象的基础版本，不以实时平台同步或因果结论为前提。

## 全局约束

- 复用现有分析结果、用户和运营模块；不重定义北极星、首次观测、推荐、交易或收益。交易额不是收入；关注或登录不等于获客；未观测不等于流失；数据不充分显示未知。
- 基于现有 owner 权限、范围、证据和版本；跨 owner 不可读写。UTC+7 业务日，平台日期和数据水位单独标识。
- 用户主动提出的问题不必关联目标。AI 仅在数据与已有回答不能解决时提业务问题，说明为什么问、答案影响什么；非阻塞问题不应中断其他调查。
- 采用 LangGraph.js 管理调查步骤与可恢复状态；保留 Bull/Redis 调度、已有业务工具、PostgreSQL 付费防重、预算、权限、证据和 Promptfoo。生产持久化不使用内存检查点；现有 runner 保留回退直到新方案验收。
- 对请求结果未知的付费调用禁止无条件重放；无用户明确授权不自动对外发布、联系用户、改预算、权益、生产配置或正式指标口径。
- 当前 X/博客/YouTube 内容以手工登记为主，关注者为部分第三方采集与关键词初筛；不要宣称已完成平台自动同步或真实内容归因。
- 每个任务先写行为测试、确认失败、最小实现、运行相关测试；不要跳过用户改动或扩大范围。记录真实环境未验证事项，合成/模拟数据不等于生产验收。

## P0-1 现状与可运行基线

**依赖：** 无。**代码入口：** `backend/src/index.js`, `backend/src/queues/queues.js`, `backend/src/db/connection.js`, `backend/src/db/aiPool.js`, `backend/src/ai/growth/agentAutonomy.js`。

- [ ] 记录 HEAD、实际已配置的数据源/worker/模型及存储拓扑（只记录是否配置，不打印密钥）；确认 API 和 worker 是否共享 SQLite。
- [ ] 跑 Agent、内容、粉丝和推荐相关已有离线测试及前端构建，记录既有失败与环境跳过；不要将既有失败直接归因于新工作。
- [ ] 用可复现数据建立首版验证案例：业务变化、来源缺失或覆盖未知、未成熟留存、用户提问、推荐人下钻、X 样本不完整、跨 owner 拒绝、付费状态未知。
- **验收：** 有清晰基线和限制清单；不启用付费模型、不改生产库。真实服务不可访问时标明未验证，仍继续可在本地实现的工作。

## P0-2 月目标与进度

**依赖：** P0-1。**入口：** `backend/src/ai/business/context.js`, `backend/src/ai/business/metricRegistry.js`, `backend/src/ai/growth/agentScore.js`, `agentStore.js`, `backend/src/routes/aiAnalysis.js`, `frontend/src/pages/growthAgentControl.js`。

- [ ] 在现有目标上增加月度北极星和辅助目标：指标、目标值、单位、方向、时间、范围、资源约束；目标修改版本化并记录生效时间。
- [ ] 提供 UI 设置、查询与目标差距，报告保存目标版本。月中变更不得回写过去报告。
- [ ] 滚动非累积指标（例如近 7 天至少 4 天有效分析人数）展示观测值与目标差，不得按日相加；无目标、缺数据及未成熟为未知。
- [ ] 测试 UTC+7 跨月、目标版本、owner 隔离、缺失数据及已有 API/数据的兼容。
- **验收：** 用户设定/修改月目标后，既能看到进度，也能还原不同日期当时生效目标；不硬编码某个目标。

## P0-3 统一问题池：业务问题与数据问题同等纳入

**依赖：** P0-1，可与 P0-2 并行。**入口：** `backend/src/ai/growth/researchQuestions.js`, `triage.js`, `sourceChanges.js`, `backend/src/routes/growthAgent.js`, `frontend/src/pages/growthAgentControl.js`。

- [ ] 定义问题类型：业务表现、数据质量、待验证假设、用户主动问题；字段包括 owner、来源、可选目标版本、范围、首次/最近观测、证据 ID、影响、未知、建议下一步、状态和负责人。
- [ ] 复用已有增长信号与质量检查：至少覆盖用户转化/留存变化、X/内容与粉丝覆盖、推荐/KOL 可用性；当数据源未接入、来源或水位未知时建立可追踪的数据问题。
- [ ] 有证据才说“漏报/延迟”；无覆盖依据写“覆盖未知”。未成熟留存不视为流失。AI 可保留假设但不能当事实。
- [ ] 按 owner、类型、对象、范围、目标版本和证据窗口去重；同一未解决缺口持续存在时更新最近观测，不每天重复生成/通知；保留新增证据和状态历史。
- [ ] 优先级结合目标关联、可观测影响、数据可信度、紧急度与成本；影响不可量化时显示未知，禁止伪造人数。
- [ ] 测试缺口、重复发现、恢复后关闭/复发、跨 owner、用户问题无目标及无变化。
- **验收：** 工作台能看到至少一个有依据的业务问题和一个可复现的数据问题；卡片说明证据、影响、下一步和状态，点击可回到数据来源。

## P0-4 用户主动提问与 AI 反问

**依赖：** P0-3。**入口：** `backend/src/routes/growthAgent.js`, `backend/src/ai/growth/researchQuestions.js`, `frontend/src/pages/growthAgentControl.js`。

- [ ] 增加用户创建研究问题入口；支持“排查注册后没分析的用户”“排查推荐人”“X 关注者是否关注 MEME”等，不强制关联目标。
- [ ] 提供可持久化问题/回答：说明为什么问、影响什么判断、是否阻塞；已有答案及上下文可复用，非阻塞问题不阻断其他调查。
- [ ] 回答后以授权用户/问题/运行身份安全恢复，支持取消；不让浏览器提交未经验证的执行状态。
- [ ] 测试等待/恢复、跨 owner、重复回答、取消、缺失目标和权限。
- **验收：** 用户提问→ AI 给出待补业务问题 → 用户回答 → 调查继续或进入明确待执行状态，保留证据和历史。

## P0-5 日报和问题工作台

**依赖：** P0-2、P0-3、P0-4。**入口：** `backend/src/ai/growth/daily.js`, `agentBrief.js`, `agentStore.js`, `backend/src/queues/workers/growthAutonomyScheduler.js`, `frontend/src/pages/growthAgentControl.js`。

- [ ] 日报显示当前月目标版本、前一个完整 UTC+7 日的事实和水位、新问题、持续未解决的数据问题、用户待回答问题、已有行动状态及建议。
- [ ] 无新重要变化时明确写“没有新的重要发现”；已有未解决问题仍可查看，不重复制造建议。
- [ ] 数据缺失只产生数据问题/未知，不生成假零或假业务结论；输出事实、假设、建议分别标记。
- [ ] 报告按 owner、日期、目标版本和 revision 幂等保存；已发布历史不静默变更。
- [ ] 测试日切、月中目标修改、重复调度、缺源、无变化和跨 owner。
- **验收：** 在同一页面看到目标、业务问题、数据问题和证据；同一缺口连续两天出现时是一条持续问题。

## P0-6 LangGraph 试点与可回退替换

**依赖：** P0-1、P0-3、P0-4。**入口：** `backend/src/ai/business/runner.js`, `backend/src/ai/business/tools/registry.js`, `backend/src/queues/jobs/businessAnalysis.js`, `backend/src/queues/workers/aiAnalysisWorker.js`；建议新增 `backend/src/ai/graph/`。

- [ ] 验证 LangGraph.js 当前稳定版本、生产 PostgreSQL checkpointer、项目 CommonJS/ESM 和现有 DeRouter 工具调用/结构化输出；锁定经过验证的版本。若不兼容，记录证据并选择成熟适配器或模型；不要假称兼容。
- [ ] 实现单 Agent 的 `加载目标/上下文 → 检查质量 → 计划 → 受控工具补查 → 证据验证 → 提问或结论`；至少让“用户转化”真实任务通过框架跑通。
- [ ] 后端保留 owner 授权、查询上限、提示注入防护、付费 fence、预算、取消和结果证据校验；模型不能执行任意 SQL/外部写操作。
- [ ] 保留旧 runner 默认与历史恢复路径，新运行按 feature flag 选择；checkpoint 持久化且绑定 owner、问题和 run，未知付费请求不得自动重放。
- [ ] 测试中断恢复、重复入队、跨 owner、超时、预算、未知付费调用、等待回答和提示注入。影子运行只读，使用独立 run ID 和预算，不触发通知及业务动作。
- **验收：** 用同一固定数据案例，新图至少调用三个业务工具并回溯证据；重启后可以安全恢复；失败可切回旧 runner。完成真实对照并获授权后再逐步退役旧编排，避免永久维护两套。

## P1-1 三条增长链路的 AI 工具

**依赖：** P0-3、P0-6。**入口：** `backend/src/ai/business/tools/registry.js`, `contentAdapters.js`, `backend/src/analytics/referralInsights.js`, `referral.js`, `backend/src/ai/growth/kolReader.js`，现有漏斗/路径/留存服务。

- [ ] 用户转化/留存：查询分母、成熟情况、关键路径和用户下钻，输出采集覆盖。
- [ ] X/内容：返回已登记内容、平台曝光/互动、关注者分类与采样覆盖；无法关联产品用户或来源时标注未知。
- [ ] 推荐/KOL：复用真实推荐关系和 CRM，按授权下钻推荐人及其下游用户表现；排除已定义的无效关系，区分绑定与新增、相关与因果。
- [ ] 每个工具都提供 period、scope、owner、指标版本、证据 ID、水位、覆盖、警告、可下钻位置及输出上限。返回敏感用户明细时遵循现有权限，不把不必要明细送给模型。
- [ ] 验收：三个方向各完成一条真实或可复现的调查；当数据不可用时创建数据问题，不能填零。

## P1-2 建议转待办与观察复盘

**依赖：** P0-3、P0-4、P1-1。**入口：** `backend/src/ai/growth/actionWorkflow.js`, `agentLearning.js`, `experienceFeedback.js`, `backend/src/routes/operationTasks.js`, `frontend/src/pages/workbench.js`。

- [ ] 建议转已有运营待办，记录问题、证据、负责人、状态；区分建议、接受和实际执行。
- [ ] 实际执行后固定基线、指标方向和观察期；到期自动启动只读复盘，输出改善、未观察到改善或证据不足。
- [ ] 保留范围、水位、成熟度和混杂因素；下降型指标方向正确，前后比较不宣称因果；用户未执行不进入效果统计。
- [ ] 测试未执行、未成熟、负向指标、缺水位、跨 owner 和重复复盘。
- **验收：** 一个问题从证据到待办、人工执行、成熟观察、复盘可追溯；下一轮研究能读取该结果。

## P1-3 周报与月报

**依赖：** P0-2、P0-5、P1-2。**入口：** `backend/src/ai/growth/agentBrief.js`, `agentStore.js`, `backend/src/queues/workers/growthAutonomyScheduler.js`, `backend/src/routes/aiAnalysis.js`, `frontend/src/pages/growthAgentControl.js`。

- [ ] 周报使用已结束的 UTC+7 自然周，月报使用已结束的 UTC+7 自然月；包含当期生效目标版本、业务问题、数据问题、行动和成熟复盘。
- [ ] 周报聚合问题和行动，不拼接七篇日报；月报覆盖全链路可用事实和未接入状态，不凭空生成因果或预算收益。
- [ ] 保存证据 ID、版本、水位、覆盖及 revision；UTC+7 跨月、闰年、重复调度和目标变更均有测试。
- **验收：** 同一目标和行动能从日报追至周报、月报；历史目标版本可还原。

## P2 平台自动接入、评测与切换

- [ ] 官方 X、博客、YouTube 按各自官方授权和真实 API/配额接入；展示同步状态、采集时点、覆盖、失败和费用。真实外部账号与权限不可通过测试模拟冒充已接通。
- [ ] 连接追踪链接到实际站内访问、注册与后续使用；区分内容触达、用户身份匹配和渠道归因。
- [ ] 用 Promptfoo 基于独立留出业务案例评测引用正确性、用户问题回答、工具选择、数据不足、注入、成本与延迟；真实模型对照需要明确预算和授权。
- [ ] 在通过真实对照和恢复演练后按 owner 切换框架；历史运行仍可读、旧 runner 可回退。确保现有安全控制等价后，退役被框架替代的自写编排。

## 执行顺序和交付

推荐顺序：P0-1 → P0-2/P0-3 → P0-4/P0-5 → P0-6 → P1-1 → P1-2 → P1-3 → P2。P0 完成代表可做内部试用，不代表生产可用或全链路数据已接入。

每个阶段交付：修改文件、测试命令和结果、可演示入口、数据来源/覆盖、未完成项和风险；不为完成率虚构数据。生产启用必须单独核查部署、迁移、真实模型和第三方授权。完整架构、迁移/回退和安全要求见下方合并的设计方案。


---

# 附录 A：完整设计与实施方案

以下是合并的详细设计；如与前面的第一版任务清单不一致，以当前任务清单和用户最新要求为准。

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


---

# 附录 B：历史实施计划（仅供参考）

以下内容形成于 2026-10-27，部分阶段可能已经实现，且架构选择或环境可能过时。不得将其中的旧要求当作当前实施指令；以当前代码、用户最新要求和本文第一版任务清单为准。保留仅为追溯既有设计及验证细节。

# Growth Agent Implementation Plan / 实施交接总计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 执行方式遵循用户和当前环境指令；此文档不要求自动派生子代理。本文件为跨子系统总计划，按阶段落实为小步实现，不一次重写整个系统。

**Goal:** 让 LogEarn Growth 的一个 AI Agent 能理解业务目标、自主调查增长、追溯证据、闭环行动，并经过评估持续优化记忆和提示词。

**Architecture:** 保留当前模块化后端与业务分析服务，在其上增加统一业务语义、证据协议、工具注册、持久研究状态和评估发布机制。页面与 Agent 共用指标计算，一个 DeRouter 模型贯穿分析、研究及优化。

**Tech Stack:** Node.js（后端要求 >=22.5.0）、CommonJS/Express、Hologres、既有 SQLite、标准 PostgreSQL、Redis/Bull；前端原生 JS ES modules/Vite/ECharts/Vitest。根 README 的 Vue 描述与当前前端 package.json 不符，不据此引入 Vue。

**Spec:** [架构方案](../../ai/GROWTH_AGENT_ARCHITECTURE_PROPOSAL_2026-10-27.md)；[当前代码评估](../../ai/GROWTH_AGENT_AUDIT_2026-10-27.md)。先阅读本文件，再读这两份文档。

## 用户意图与实施范围

用户先要求清除旧 LLM，只保留 DeRouter，随后要求整体增长 Agent 架构、自主获取信息、自主探索、自主进化，以及明确的自主提示词优化闭环。最后要求写文档，换窗口实施。

本窗口只写文档，不启动实施、不创建新聊天、不提交代码。下一个窗口按本计划分阶段实施并记录进度；不得把“模型请求成功”或“写好方案”当作 Agent 已完成。

## Global Constraints

- 项目根目录：`/Users/leon/Documents/work/Logearn-growth`。执行前检查适用 AGENTS.md 与 git status。
- 工作区已有大量修改和未跟踪文件，包括 AI 相关代码。不得 reset、清理、覆盖这些内容；先判断差异再局部修改。不要把别人的修改混进提交。
- 沿用单模型：`AI_DEFAULT_MODEL=claude-sonnet-4-6`；`OPENAI_BASE_URL=https://api.derouter.network/openai/v1`；密钥使用后端 `OPENAI_API_KEY`，不输出、不提交、不写入前端。
- 后端 `backend/.env` 已由用户填写密钥。不要重建或覆盖；不要重新要求用户把密钥发到聊天里。
- 使用现有 Chat Completions provider。不得重新切回国产/Opus双模型，不因模型名称为 Claude 而切换 Anthropic 协议。
- 单模型可配置模型ID，但运行时只有一个活动模型；分析与评估提示词角色可以不同，不新增多模型配置。
- 所有日期窗口沿用 Asia/Bangkok / UTC+7；人数、DAU、首次观测、新注册、代理行为、真实成功和交易事实保持区别。
- 数据未成熟、覆盖缺失、未观测和未知不强行变成0、流失或失败；前后对比不声称因果。
- 人工业务报告继续可独立运行，不能因缺 Redis、AI 数据库或模型额度而无法使用。
- 不引入新的 Agent 框架、微服务、向量库或嵌入服务，除非现有实现确实无法满足具体任务，并在变更记录中解释。
- 自主读取限于已有授权业务范围；对外消息、生产配置、正式口径、真实运营预算或用户权益变更，另走明确授权流程。
- 持续探索与自动提示词发布默认关闭；基础就绪后由用户显式开启，提供预算和停用开关。

## Review Focus

1. 跨所有者、活动或人群的工具查询和记忆检索必须在服务端拒绝；测试归属阶段2、4、6。
2. 多数据源水位不一致、历史不足及待成熟队列必须显式返回，不用同一 snapshotId 冒充强一致；测试归属阶段3。
3. Worker重启、取消与 stalled 重执行不能造成重复建议或无声重复付费；测试归属阶段1、5。
4. 外部资料和用户反馈中的指令不得改写权限或稳定事实；测试归属阶段6、7。
5. 提示词优化不得读取留出答案作弊、修改评分规则、自行提升权限或因自评高分直接上线；测试归属阶段7。

## 当前事实与未验收边界

- 已用项目 OpenAI provider 调用 DeRouter，模型返回 OK，服务端usage为31 tokens；这只是接口连通测试。
- 本轮定向测试44项，40通过4失败。`aiBusiness.test.js` 仍模拟旧配置，缺 `getConfig` 或 `openai`；其中旧国产→Opus断言已不适用。
- 失败不能只删掉：把调查证据保留、预算失败、真实usage/owner隔离等语义迁到单模型回归。
- 尚未验证登录→业务查询→入队→Worker→模型→AI存储→前端读取→反馈的完整真实链路。
- 前端 `aiAnalysis.js`、分析与复盘提示词、`docs/ai/README.md` 仍有旧模型文字；runner仍识别 `needsOpus`。
- 当前 AI 调查只支持 north/growth/weekly；复盘仅 north/growth。scope只支持source，活动/人群会明确拒绝。
- `analysisJobs.js` 用进程内Map/Worker；AI执行用Bull。现有RAG索引读取旧 `ai_findings`，不等于已接通当前建议与复盘。
- 金额预算依赖真实费率；费率0表示未知，不表示免费。DeRouter embeddings能力尚未验证。

## 代码地图

| 路径 | 责任 |
| --- | --- |
| backend/src/ai/llm/config.js、client.js、providers/openai.js | 单模型配置、调用、usage与缓存 |
| backend/src/ai/business/runner.js、policy.js | 调查循环、输出校验、路由语义 |
| backend/src/queues/jobs/businessAnalysis.js、retrospective.js | 分析与复盘、初始证据与工具白名单 |
| backend/src/queues/queues.js、workers/aiAnalysisWorker.js | AI队列与执行 |
| backend/src/services/businessReport.js | 业务证据报告与人工复盘 |
| backend/src/analytics/businessPriorities.js | 指标定义、排序、时间与scope |
| backend/src/data/businessEvidence.js | north/growth/weekly数据入口 |
| backend/src/services/analysisJobs.js | 分析计算任务与短期结果缓存 |
| backend/src/db/aiRecords.js、aiPool.js、migrations/ | AI持久化、历史、事务与权限 |
| backend/src/db/businessReports.js、connection.js | 既有人工报告与行动存储 |
| backend/src/routes/aiAnalysis.js、businessAnalysis.js、aiConfig.js | 认证后业务API |
| backend/src/analytics/、data/ | 复用现有漏斗、路径、交易、活动、人群计算 |
| backend/src/ai/rag/knowledge/ | 旧检索与索引；需审查数据模型和权限后复用 |
| frontend/src/pages/aiAnalysis.js、businessAnalysis.js | 表单、结果、建议、人工入口 |
| frontend/src/api/aiAnalysis.js、businessAnalysis.js | 前端API |

## 共享接口（建议目标，执行时如需调整必须同步消费者与本文）

类型用JSDoc/JSON Schema表达，遵守项目现有JS写法，不为此迁移TypeScript。

```text
Scope = {source, activityId?, cohortId?}
Context = {ownerId, runId, traceId, scope, period:{start,end,timezone}, sourceVersions}
Metric = {id, version, label, definition, unit, supportedScopes, supportedDimensions,
          maturityRule, queryAdapter, reviewAdapter?}
Evidence = {id, metricId, definitionVersion, filters, period, value,
            numerator?, denominator?, sampleSize?, sourceVersions, watermarks,
            coverage, warnings, queryFingerprint, generatedAt, reportLocator}
ToolResult = {status:'ok'|'unavailable', evidence:Evidence[], cursor?, warnings:[]}
Tool = {id, version, inputSchema, supportedScopes, execute(input, context):Promise<ToolResult>}
Claim = {id, kind:'fact'|'hypothesis'|'recommendation', text, evidenceIds, uncertainties}
Run = {id, ownerId, status, goalVersion, scope, sourceVersions, promptVersions,
       budget, usage, plan, hypotheses, nextStep, checkpointVersion}
Memory = {id, ownerId, kind, status, scope, evidenceIds, validFrom, expiresAt?,
          supersedesId?, counterEvidenceIds, content}
PromptVersion = {id, role, parentId?, contentHash, content, status, evaluationId?}
```

接口函数：`listCapabilities(context)`、`describeMetric(id, context)`、`executeTool(id,input,context)`、`getEvidence(id,context)`、`validateClaims(claims,context)`、`runResearch(runId)`、`retrieveMemory(query,context)`、`evaluatePrompt(candidateId,suiteId)`、`activatePrompt(candidateId,evaluationId)`。

ownerId只能由认证/任务上下文注入，不能信任模型或请求体传入值。sourceVersions不是数据库事务快照承诺。工具无法支持某种scope时明确拒绝，不静默扩大范围。

## 任务执行协议

每个编号独立更新状态；每个阶段至少交付一个可运行增量。涉及行为的任务按“先明确失败场景并运行测试→最小实现→相关测试通过→更新文档与证据”推进。不要为纯文案或可逆配置写机械测试。提交前只暂存自己确认的差异，是否提交遵循当前用户授权。

后续阶段的文件名是设计目标，先搜索已有等价模块，存在则复用。下面每阶段的新增测试文件应覆盖所列验收场景，不以静态字符串断言替代运行验证。

## 阶段1：当前链路收尾（P0）

**Files:** 修改代码地图中的config/client/runner、analysis/retrospective jobs、aiAnalysis页面、AI文档及 `backend/test/aiBusiness.test.js`。必要时修改队列与迁移；不擅自重建数据库。
**Interfaces:** 保持现有分析API兼容；为每次实际模型调用记录promptVersions/runId/traceId的扩展点。

- [ ] T01 清理旧模型语义：移除needsOpus分支、升级提示词和UI选项，保留单模型深度研究含义或兼容旧参数并明确说明；检查其他活跃入口，不盲删旧文件。
- [ ] T02 更新单模型回归：补查后保留证据、JSON修复仍使用同模型、预算耗尽不能保存成功、真实usage与owner隔离。修复原4项失败并重新运行。
- [ ] T03 增加运行健康状态：区分API、数据源、Redis、Worker、AI数据库/迁移和模型配置；不在每次健康检查发付费请求。旧任务状态与重放行为可解释。
- [ ] T04 完成一次最小真实业务E2E：正确登录、选有效历史范围、生成证据、入队、Worker执行、事务保存、前端读取、反馈。使用已有凭证，不输出敏感内容；若环境缺失，记录真实阻塞，不用mock冒充验收。

**验证:** `cd backend && node --test test/aiBusiness.test.js test/businessReports.test.js`；`cd frontend && npx vitest run src/analytics/__tests__/aiAnalysisPage.test.js src/analytics/__tests__/businessAnalysisPage.test.js`。另记录真实E2E的脱敏ID、状态与调用量。副作用重复测试不得真实重复付费。

## 阶段2：统一业务与指标（P1）

**Files:** 新建/复用 `backend/src/ai/business/context.js`、`metricRegistry.js`、`scope.js`；扩展现有报告和认证后路由；新增 `backend/test/agentContext.test.js`。
**Interfaces:** 产出Metric、Scope和带版本业务上下文；被证据层、工具层与复盘共同使用。

- [ ] T05 保存业务目标与约束：目标ID/版本、值、截止日期、资源、预算、优先级，按owner保存；每个run固定引用版本。
- [ ] T06 建立指标目录：从现有实现登记指标，描述单位、分母、成熟规则、维度和复盘能力；不另写一套计算。
- [ ] T07 统一source/activity/cohort范围解析：复用现有人群快照与固定名单，检查交集、所有权与空集，未支持范围拒绝；禁止空人群退化为全平台。
- [ ] T08 建立业务变化记录：活动、产品版本、入口和采集变更，区分发生时间/录入时间，记录来源与有效期。

**验证:** `cd backend && node --test test/agentContext.test.js test/businessReports.test.js`。断言旧目标版本不随编辑变化、不同owner互不可读、空人群保持空、注册与首次观测口径不同、指标缺reviewAdapter时不能承诺可复盘。

## 阶段3：统一证据层（P1，依赖2）

**Files:** `backend/src/ai/business/evidence.js`、现有businessReport/businessEvidence/aiRecords与版本化迁移；新增 `backend/test/agentEvidence.test.js`。
**Interfaces:** `getEvidence`、`validateClaims`，产出Evidence和Claim校验结果；后续工具不得返回无身份的关键数字。

- [ ] T09 实现Evidence协议：数值、单位、分子分母、样本、正式定义版本、过滤条件和期间。
- [ ] T10 记录各源水位与质量：迟到数据、历史不完整、缺交易事实和未成熟样本均可表示；避免以一个snapshotId隐藏多源差异。
- [ ] T11 保存不可变证据档案和可复现查询指纹；权限校验后按需取明细，报告提供可打开定位参数；修订产生新版本。
- [ ] T12 结构化事实/假设/建议，服务器校验证据归属、数值引用和scope；无法确定语义推断时标记需评估，不假称程序已证明推理正确。

**验证:** `cd backend && node --test test/agentEvidence.test.js test/growthEvidence.test.js test/productChain.test.js`。覆盖模型伪造证据ID、错误数字、跨owner引用、分母0、不同源水位、未知交易、过期查询仍能查看原始档案。

## 阶段4：扩展调查工具（P1，依赖2–3）

**Files:** `backend/src/ai/business/tools/{registry,metrics,funnel,paths,retention,activities,segments,economics,quality}.js`，复用现有analytics/data模块；新增 `backend/test/agentTools.test.js`。
**Interfaces:** `listCapabilities`、`describeMetric`、`executeTool`，统一ToolResult；context由服务端传递。

- [ ] T13 工具目录和schema：列出能力、限制、输入示例、指标说明和权限要求；工具错误有类型，可区分无数据和故障。
- [ ] T14 接漏斗、路径、成熟留存、产品真实交易链，支持逐层补查，不重复实现当前分析算法。
- [ ] T15 接渠道、活动、人群、KOL成本收入与质量检查；不同币种不可直接合计，交易量不能冒充收入，未知财务覆盖明确返回。
- [ ] T16 可组合查询：白名单指标/维度/过滤器，服务器编译查询；扫描量、时间、结果大小和并发预算；明细分页，避免整库注入上下文。

**验证:** `cd backend && node --test test/agentTools.test.js test/productChain.test.js test/activityMonitor.test.js test/collaborations.test.js test/operationTasks.test.js`。验证页面/工具同口径、越界source与人群拒绝、注入式过滤拒绝、超预算停止、未知不是0、分页跨owner拒绝。

## 阶段5：自主研究运行（P2，依赖4）

**Files:** 重构runner为调度入口；新增 `researchState.js`、`researchRunner.js`、`researchBudget.js`，扩展aiRecords/迁移/队列/API与前端；新增 `backend/test/agentResearch.test.js`。
**Interfaces:** `runResearch(runId)`，Run状态建议 `queued/running/waiting/completed/incomplete/failed/cancelled`；升级旧API时保持兼容映射。

- [ ] T17 研究循环：质量检查→目标拆解→多个假设→区分假设的查询→反证→结论；记录停止原因，证据不足可正常交付未知。
- [ ] T18 持久化研究计划、假设、证据引用、下一步和checkpointVersion；问题队列保留未解决问题，检查点乐观锁避免并发推进。
- [ ] T19 实现同一报告连续追问、过程展示、取消与恢复。取消后不得再发新调用，已在途请求记录为在途，不承诺一定免计费。
- [ ] T20 工具查询去重、付费调用尝试日志、预算预留与结算、重启/stalled恢复。外部模型不支持幂等时不可声称exactly-once，调用状态不明应暂停核查而非盲重发。

**验证:** `cd backend && node --test test/agentResearch.test.js test/aiBusiness.test.js`。覆盖三工具调查、失败补查、相反证据、重复查询、取消竞争、重启恢复、双Worker领取、付费结果未知、不完整报告不得标completed。

## 阶段6：知识、记忆与业务闭环（P2，依赖3、5）

**Files:** `knowledge.js`、`memory.js`，复用既有aiRecords/businessReports/operationTasks与文档索引；扩展复盘job；新增 `backend/test/agentMemory.test.js`。
**Interfaces:** `retrieveMemory(query,context)`产出Memory与来源；建议关联既有任务ID。复盘按Metric.reviewAdapter执行。

- [ ] T21 接入业务文档、用户反馈、人工与AI历史；先范围/时间过滤再检索。旧RAG必须核查schema和owner隔离；向量检索不作为首期前置依赖。
- [ ] T22 记忆分类与状态：事实、调查经历、经验假设、验证策略；候选/待验证/支持/否定/未知/过期，保留反例、修订和撤销。
- [ ] T23 建议转现有运营任务草稿，记录负责人、目标人群、基线、实际动作和时间；避免AI建议和人工待办互相自动覆盖，跨库链接幂等可恢复。
- [ ] T24 扩展交易、收入、周核心等真实可计算的复盘适配器；缺指标明确不可用。人工采纳不等于有效，无对照不能标因果成功。

**验证:** `cd backend && node --test test/agentMemory.test.js test/operationTasks.test.js test/businessReports.test.js`。覆盖过期经验降权、相反经验保留、跨owner文档拒绝、资料注入不执行、拒绝原因被使用、收入缺事实不替换成人数、任务重试不重复创建。

## 阶段7：自主提示词优化（P2/P3，日志与版本从阶段1起建设）

**Files:** `backend/src/ai/prompts/` 保存初始角色模板；新增 `backend/src/ai/evaluation/{cases,graders,runner}.js`、`backend/src/ai/optimization/{optimizer,publisher}.js`，配合版本化存储；新增 `backend/test/promptOptimization.test.js` 与脱敏评估fixtures。
**Interfaces:** PromptVersion；`evaluatePrompt(candidateId,suiteId)`返回逐案例结果、硬门槛、成本/耗时与版本；`activatePrompt(candidateId,evaluationId)`只能接受有效评估批准的版本。

- [ ] T25 分拆分析、规划、工具选择、结论、复盘提示词，记录不可变版本和内容hash；每次模型调用绑定实际版本。多角色仍用同一模型。
- [ ] T26 采集任务轨迹、人工纠正和失败标签；归因区分缺数据、工具故障、口径、提示词和模型输出；脱敏入库，防止把秘密带入优化案例。
- [ ] T27 优化器针对失败提出最小候选diff，说明预期修复和风险。候选生成与开发案例可见，留出答案不可见；评估器使用固定版本规则、程序检查、人工样本与辅助模型评分。
- [ ] T28 影子运行→有限灰度→自动启用/回滚；默认只产生候选。自动发布开启后要求固定关键用例全部通过、证据/权限硬门槛零失败，质量不低于基线；成本/耗时不超过用户配置的相对容忍度。未配置发布预算/门槛则不自动发布。模型没有发布器和评分配置写权限。

**必须覆盖的评估集:** 新注册/首次观测混淆、D7未成熟、缺失交易、交易额/收入混淆、数据延迟、渠道小样本、越权scope、资料指令注入、相反证据、历史失败建议重复、工具故障、取消与预算耗尽。

**验证:** `cd backend && node --test test/promptOptimization.test.js`。断言没有评估不能发布、候选不修改当前版、已知关键回归阻止发布、留出泄漏拒绝、不能改权限与指标、并发发布原子切换、退化可恢复旧版。离线评估默认用fixtures；真实付费评估另设独立预算并记录费用。

## 阶段8：持续探索与运行保障（P3，依赖5–7）

**Files:** `researchScheduler.js`、`researchQuestions.js`、`agentHealth.js`，复用现有监控、队列与用户设置；新增 `backend/test/agentMonitoring.test.js`。
**Interfaces:** 持久研究问题与数据水位去重键；开启设置包含owner、scope、预算、频率、通知偏好和停止开关。

- [ ] T29 数据变化/业务事件触发研究；默认关闭，用户开启后才运行；先规则检查再决定是否付费调用。
- [ ] T30 按目标相关性、影响规模、证据缺口和查询成本排序问题，保存研究次数，限制无止境分群搜索；候选发现用留出时期或实验验证。
- [ ] T31 统一租户和任务预算、并发、数据查询量、模型调用量、执行超时和全局停止；记录未知费率的限制，不承诺美元硬限额有效。
- [ ] T32 健康监控、调查重放、权限审计和重要发现通知。相同水位不重复研究，状态不变不刷屏；外部消息渠道需用户授权，未连接时先在产品内展示。

**验证:** `cd backend && node --test test/agentMonitoring.test.js`。覆盖默认不执行、重复事件去重、数据未就绪跳过、预算预留竞争、停用后无新调用、无新发现不通知、越权研究拒绝、提示词发布失败保持当前版。

## 分批交付与非目标

- 第一批：阶段1–4，同时建立T25提示词版本与T26轨迹的基础。目标：可靠查询全增长、数字可核对。
- 第二批：阶段5–6，完善评估案例。目标：可持续调查、可记忆、可复盘。
- 第三批：阶段7–8的候选优化、灰度和自主探索。目标：可度量的进化，不是提示词自说自话。
- 不要求模型训练、权重微调、多Agent框架、重建现有后台、直接生产SQL、自动发营销消息或自动改变运营预算。

## 整体验收问题

- 哪个渠道带来新增但没有激活？需要给出成熟分母和证据定位。
- 详情→主动分析→分析成功→真实成交卡在哪里？未知交易覆盖不得当作流失。
- 某活动/人群表现如何？范围必须真实落实，不扩大成全平台。
- 活跃下降由哪些组成贡献？能检查质量、假设与反证。
- 为什么又给出以前拒绝过的建议？应说明新证据或资源变化。
- 她这次提示词比上次好在哪里？给出版本diff、独立评估结果、费用与回滚信息。

## 已知测试命令与进度记录

```bash
cd /Users/leon/Documents/work/Logearn-growth/backend
node --test test/aiBusiness.test.js test/businessReports.test.js
node --test test/growthEvidence.test.js test/productChain.test.js test/trackingAudit.test.js test/activityMonitor.test.js test/activityTargets.test.js test/collaborations.test.js test/operationTasks.test.js

cd /Users/leon/Documents/work/Logearn-growth/frontend
npm run build
```

以上是基线命令；实施后按相关行为补测。需要全套回归时运行backend/frontend各自的npm test，并区分原有失败和新增失败。文档中的新测试路径在实施对应任务时创建，尚不存在不等于环境损坏。

每个任务完成后，在本文件打勾并记录：变更文件、验证命令/结果、实际限制、迁移要求。真实付费调用需记录次数与usage，不输出密钥。未完成事项保持未勾选，不能因写了代码就宣称已上线。

## 新窗口启动指令（可直接复制）

```text
请在 /Users/leon/Documents/work/Logearn-growth 实施 Growth Agent。
先阅读本文件，
再阅读其中链接的架构方案与代码评估，检查适用的 AGENTS.md 和工作区现有改动。
从第一批阶段1–4开始，分阶段完成并更新任务勾选和验证记录；
同时建立提示词版本和调用轨迹，为后续自主优化保留数据。
已有 DeRouter 密钥在 backend/.env，不要覆盖、输出或索要密钥，保持单模型。
保留现有未提交工作，不要重写增长指标，不要将接口连通当作完整业务验收。
第一批完成后给出实际验收结果和剩余任务，持续探索及提示词自动发布保持关闭。
```
