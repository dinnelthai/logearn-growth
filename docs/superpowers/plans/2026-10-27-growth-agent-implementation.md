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
先阅读 docs/superpowers/plans/2026-10-27-growth-agent-implementation.md，
再阅读其中链接的架构方案与代码评估，检查适用的 AGENTS.md 和工作区现有改动。
从第一批阶段1–4开始，分阶段完成并更新任务勾选和验证记录；
同时建立提示词版本和调用轨迹，为后续自主优化保留数据。
已有 DeRouter 密钥在 backend/.env，不要覆盖、输出或索要密钥，保持单模型。
保留现有未提交工作，不要重写增长指标，不要将接口连通当作完整业务验收。
第一批完成后给出实际验收结果和剩余任务，持续探索及提示词自动发布保持关闭。
```
