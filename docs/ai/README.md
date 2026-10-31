# LogEarn 业务分析与可选 AI 建议

本页是当前代码的运行说明。旧 Phase 完成报告、成本收益估算及自动调度说明不作为当前能力的验收依据。

## 不调用 AI 也可以工作

“数据分析 → 业务优先级”是默认的人工入口。它独立读取本期、等长对比期、周核心目标和渠道成熟样本，展示数值、分母、规则分、排序理由、数据覆盖限制及核查步骤。

用户可以直接建立人工待办、设置自己的优先级、记录执行与拒绝原因，并主动查看执行前后的等长完整业务日数据。系统不自动把观测变化认定为有效、无效或因果。报告和人工行动保存在现有 SQLite 业务数据库，随正常 schema 初始化，不需要 AI PostgreSQL 迁移。

人工页面/API 不加载 AI SDK、AI 存储或 Bull，不需要 Redis、模型密钥或订阅额度。它仍需要业务数据源、正常登录及现有业务数据库可用。周核心数据不可用会单独说明，不阻断其他证据。AI 路由按需加载，配置缺失和服务故障不会阻断业务页面启动。

“AI 建议（可选）”是独立入口。在业务报告中明确点击“请 AI 分析这份报告”后才创建模型任务。AI 使用同一份持久化证据，并读取人工行动及相关人工历史；AI 失败不会改写业务证据、规则排序或人工决策。AI 的建议状态与人工待办分开保存，不会自动相互覆盖。

### 人工接口

- `POST /api/business-analysis/reports`：title、start、end、businessScope:{source}、focusGoal、question。
- `GET /api/business-analysis/reports`；`GET /api/business-analysis/reports/:id`。
- `POST /api/business-analysis/reports/:id/actions`：candidateId、title、priority、note。
- `PUT /api/business-analysis/reports/:id/actions/:actionId`：status、note、executedAt。
- `POST /api/business-analysis/reports/:id/actions/:actionId/review`：只计算业务数据，不调用模型。

以上接口均按登录用户检查报告和行动所有者。

## 工作方式

用户选择时间、来源、增长目标并补充业务背景，主动点击分析。后端按同一数据快照读取本期、等长对比期、增长拆解和周核心用户，并读取该用户相关的历史建议、行动、拒绝原因和复盘经验。

本地计算观测人数变化、渠道激活/留存缺口和周核心业务目标差距，作为排序证据。模型还需要说明实施成本、不确定性、具体行动和验证条件。数据量、比例和采集覆盖通过业务代码计算，不由模型编造。

- 分析、补查、JSON修复与复盘均通过 DeRouter Chat Completions 使用同一活动模型。
- auto/complex 保留兼容，表示调查深度，不切换模型。
- 补查工具支持 north / growth / weekly；查询限于所选来源和当前、对比期。未支持的查询会报任务未完成。
- 必要查询不会因省钱被省略。达到调用、Token、输入大小或时间预算后，任务明确失败，用户可调整预算并主动重试。
- 不运行 AI 定时任务。API 和 Worker 可以等待请求，但空闲时不调用模型。

## 配置

在 `backend/.env` 配置，文件已被 Git 忽略：

```dotenv
# 单模型 DeRouter（密钥仅填写后端 .env）
AI_DEFAULT_MODEL=claude-sonnet-4-6
OPENAI_BASE_URL=https://api.derouter.network/openai/v1
OPENAI_API_KEY=<后端密钥>
```

未配置后端 OPENAI_API_KEY 时明确失败。结构不完整会在预算内使用同模型修复，预算耗尽不保存成功。费用基于配置费率估算，0费率表示未知；usage来自服务端。金额检查尚非并发预留，服务商账单为准。

## 数据与启动

业务查询沿用已有 Hologres 数据源（PG 环境变量）。AI分析记录、建议、成本、历史经验优先使用 `AI_DATABASE_URL` 指向的独立标准PostgreSQL；未配置时使用原有 `readWritePool` 主库。若PGHOST是Hologres，请另行配置标准PostgreSQL连接串 `AI_DATABASE_URL=postgresql://用户:密码@地址:5432/数据库`。此版本的迁移包含标准 PostgreSQL 外键、事务、JSONB和视图，需要支持这些功能的 PostgreSQL 实例；不能把不兼容的分析引擎当作已迁移成功。

```bash
cd backend
npm install
npm run migrate:ai
npm run dev
# 另开一个终端，在 backend 目录运行
npm run worker:ai
# frontend 目录
npm run dev
```

Redis用于Bull异步队列；不需要Qdrant。`queue:dev`只启动API，不启动定时调度器。WebSocket默认关闭，页面使用状态轮询；旧 `/api/queue` 接口已停用。

## 建议与复盘

页面可采纳、拒绝或记录已执行。拒绝时需要原因，执行时需要实际行动及执行时间。至少经过3个完整UTC+7业务日后，用户可主动复盘。

复盘排除执行当日，对比执行前后的等长完整业务日，周期去重人数直接比较，不除以天数冒充DAU。激活和D7比例从成熟队列汇总分子、分母。缺失指标标记不可用。没有对照实验时不声称因果，证据不足的经验标记unknown。下一次分析会读取相关历史；这里的“进化”是业务记忆和复盘，不涉及训练模型。

## 当前范围与限制

- 支持1–31天历史范围、来源过滤；活动和用户群筛选尚未接入，API会明确拒绝这些参数，不会静默扩大到全平台。
- 收入和转化依据增长证据中的渠道交易数据，不等于已接入完整财务事实。缺失证据必须补充或说明无法判断。
- 数据截止时间、历史和连续采集覆盖必须保留，未观测不能当作真实流失。
- 前端离开页面只取消显示轮询，不中断后台正在执行的任务；可从历史记录查看结果。
- 队列任务不自动重试付费调用；分析失败可由用户主动重试。请求标识防止同一次提交被重复入队。
- 部署前需要完成 PostgreSQL 迁移和真实模型联调；无密钥时只能做隔离测试，不能宣称中转站模型可用。

## API

- `POST /api/ai-analysis/analyze`：title、dateRangeStart、dateRangeEnd、businessScope:{source}、focusGoal、userQuestion、modelMode:auto|complex、requestKey、可选 evidenceReportId（必须属于本人且分析范围一致）。
- `GET /api/ai-analysis/list`；`GET /api/ai-analysis/:id`。
- `POST /api/ai-analysis/:id/retry`：主动重试自己的失败分析。
- `PUT /api/ai-analysis/suggestions/:id/status`：userStatus、actualAction、executedAt、actionScope:{source}、rejectionReason。
- `POST /api/ai-analysis/suggestions/:id/retrospective`：requestKey。
- `GET /api/ai-analysis/retrospectives/list`；`GET /api/ai-analysis/retrospectives/:id`。
- `GET /api/ai-analysis/jobs/:jobId/status`；`GET /api/ai-analysis/cost-stats`。

所有入口通过现有会话认证，记录和任务均校验所有者。模型不能执行运营写操作或对外发送消息。


---

## Growth Agent 2.0 — 当前升级入口（2026-10-31）

当前开发分支：`codex/ai-comprehensive-upgrade`。这次升级目标是把 Growth Agent 从统计分析助手推进为理解 LogEarn 经营、制定增长决策并跟踪行动的虚拟增长负责人。

**新 Agent 接手顺序：**

1. [Growth Agent Handoff](./GROWTH_AGENT_HANDOFF.md) — 当前分支、代码入口、限制和下一步。
2. [LogEarn Business Brain](./LOGEARN_BUSINESS_BRAIN.md) — 产品知识、生命周期、指标语义和运营规则。
3. [Growth Agent 2.0 Implementation Plan](./GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md) — 分阶段范围和验收。
4. [Growth Agent Upgrade Log](./GROWTH_AGENT_UPGRADE_LOG.md) — 已实现内容和真实验证记录。

**当前代码状态：** Business Brain v1、模型上下文 v5 和 AI 运营报告自定义时间范围已加入指定分支。新建分析默认使用 v5；历史任务保留原有 v1-v4 协议。自定义报告支持 UTC+7 毫秒时间戳、1–31天、结束不含、前置等长周期比较及历史记录重新生成。CI 已在该分支启用；本轮 Node / frontend CI 尚在运行，不能据此宣称本地 Worker 或生产环境已完成真实模型验收。

历史基础设施规划和早期 Phase 报告仅作历史背景，当前实现以代码、上述交接文档和最新测试结果为准。
