# Growth Agent 模块化 — Work 验收交接（2026-10-29）

本文件用于把待验收内容交给 Work，不是生产验收通过证明。

## 代码范围

- 来源：seo 分支；执行前核对 Git HEAD 和工作区。
- Agent 专用契约：backend/src/ai/business/tools/businessModuleCatalog.js，保留旧 tool ID、人工 SQL 和业务页面。
- 模块：SEO、渠道、激活与路径、登录、推荐与邀请、留存/分群、数据质量和渠道经济；跨源口径不能直接相加。
- 规划：modulePlanner.js 支持定向问题与全链路，只选已授权、非付费的项目内能力；失败模块可降级，最多一次质量补查。
- 证据：evidence.js 支持验证模型可见的数值字段路径，仍拒绝错误值和未暴露明细。
- 机会：opportunityStore.js、opportunityDecision.js。包含 owner、范围、目标版本、证据、去重、状态变更历史；影响及投入未知不得造 ROI。
- 工作台：aiGrowthModulesPanel.js，仅 Agent 工作台增加，不改人工 SEO/渠道等页面。
- 定期扫描：moduleOpportunityScan.js，经现有调度器租约，AI_GROWTH_MODULE_SCAN_ENABLED 默认关闭；不调用付费 LLM 或付费外部工具。
- 正式注册聚合 registered_users 没有以首次观测代替，暂未扩展该指标的独立读取能力。

## 迁移及回滚

新增 gw_agent_opportunities 与 gw_agent_opportunity_events 两张 SQLite Agent 专属表。
由既有 backend/scripts/migrateGrowthWorkspace.js 统一管理；必须先核验备份、API/Worker 共享存储拓扑，并在授权环境显式设置 GROWTH_WORKSPACE_SCHEMA_APPROVED=1，不能自动改生产库。
回滚时首先关闭 AI_GROWTH_MODULE_SCAN_ENABLED，然后回滚代码。表保持留存供审计，不自动 DROP。

## Work 待验收（未执行）

1. 对比前后人工 SEO、渠道、推荐/邀请、登录、漏斗、路径、留存、交易及分群。固定样本与一致水位验证筛选、分母、未知、状态、错误；不要用变化中的实时库严格对等。
2. 执行后端新增和原有测试，记录失败、跳过原因和真实环境限制。
3. 运行前端测试及桌面构建；手动检查 AI 页面机会榜、证据下钻、调查结果、状态与键盘操作，人工页面必须不变。
4. 验证 owner 隔离、工具授权、范围、无效漏斗步骤、错误值拒绝、历史任务恢复、机会目标版本、状态竞争及证据路径。
5. 检查首次观测与注册、绑定与新增、交易量与收入、未成熟与零、GSC PT 与曼谷日的不同口径。
6. 先脱敏后重放数值引用失败案例；确保诊断具体而不放松校验、不盲目重试付费请求。
7. 核对 Worker/API 的独立数据库、迁移、真实 Hologres/GSC 配置。模拟连接不算真实验收。
8. 仅获明确批准后再启用每日扫描，并核查幂等、调度容量、异常降级、禁用付费外呼。
9. 检查 OpenSEO 自部署真实连接及 DataForSEO 费用策略；本次不授权付费研究上线。
10. 对人工行动与既有待办、复盘入口进行端到端核查；未知投入不能伪造 ROI，前后变化不能宣称因果。
11. 验证人工采纳后机会转入现有 Growth Workspace：证据桥接、同一负责人/问题的重复转入、跨 owner 拒绝、待办只创建不执行。
12. 验证模型分析建议导入机会池：仅已完成分析，证据缺失/错误/跨 owner 需跳过，来源模块、版本及原分析 ID 必须留存；不调用模型。

### 推荐测试命令

~~~bash
cd backend
node --test test/businessModuleCatalog.test.js test/modulePlanner.test.js test/opportunityDecision.test.js test/opportunityStore.test.js test/moduleOpportunityScan.test.js test/secondModuleAdapter.test.js test/agentEvidenceFieldPath.test.js
node --test test/agentTools.test.js test/agentEvidence.test.js test/agentFoundation.test.js test/growthPlanner.test.js test/growthSpecialistTools.test.js test/capabilityCatalog.test.js test/capabilityGateway.test.js
node --test test/gscClient.test.js test/gscService.test.js test/gscHttp.test.js test/gscIntegration.test.js test/referralInsights.test.js test/loginEvidence.test.js
cd ../frontend
npm test
npm run build
~~~

## 新增路由

- GET /api/growth-agent/business-modules
- POST /api/growth-agent/business-modules/plan
- POST /api/growth-agent/business-modules/investigate
- GET /api/growth-agent/opportunities
- GET /api/growth-agent/opportunities/:id
- GET /api/growth-agent/opportunities/:id/history
- POST /api/growth-agent/opportunities
- POST /api/growth-agent/opportunities/:id/status
- POST /api/growth-agent/opportunities/:id/promote（仅人工采纳后，带负责人转入现有 Growth Workspace 问题与待办；不执行行动）
- POST /api/growth-agent/opportunities/import-analysis/:id（只读导入已完成分析中可验证证据的建议，不重复调用模型；需核对 PostgreSQL 分析记录与 SQLite 证据引用）

用户由已存在的认证中间件确定；机会状态写入独立 Agent 表而非业务表。
模型工具调用仍通过已有能力网关、授权及预算。

## 继续开发或需单独批准事项

- 正式业务机会从 Agent 已验证建议和真实跨模块统计自动抽取、与运营待办深度联动；当前仅支持人工引用有效证据提出机会及自动扫描质量缺口。
- OpenSEO 实际部署、关键词付费研究、账单对账与故障恢复需明确外部预算和运维验收。
- 本次未进行本地页面点击、生产迁移、付费模型请求或部署，不应把静态/隔离测试当成生产验收。
