# Growth v5 已保存周报上下文 · 零付费离线检查

**用途：**把 Phase 1 的「真实、已授权业务上下文验收」拆成可审计步骤，防止将旧 v4 周报、固定测试样例或仅成功的 CI 误报成真实 v5 验收。本脚本只验证**已保存的快照结构和本地投影**，本身无法证明来源真实性、数据新鲜度、实际模型运行或产品口径已由运营负责人批准。

## 前置条件

- 仅在已有访问权限的环境中，选一条**既存的**、已完成业务数据快照采集的周报任务。不要点击「重新生成」，不要增加付费调用、外部采集、迁移或部署。
- 基于同一个 owner 的 `ai_analysis_records` 记录检查 `filter_conditions->>'weeklyReport' = 'v1'`。该标记是历史周报任务类型，**不是 v5 版本证明**；`data_snapshot` / `context_payload` 的 `weeklyReportContractVersion = weekly-report-v2` 才是新周报结构标记。还需核实真实的保存时间、分析期间、来源覆盖及原始模型日志中的 `token-efficiency-v5`。
- 不要把 `context_payload`、业务明细、模型提示词、账号信息或数据快照复制到公开 Issue、提交记录、聊天或 CI 工件。仅在受控本机使用临时私有文件，完成后按内部安全要求清理。

## 无模型调用的检查

在仓库根目录执行：

```bash
# 文件由已授权的只读数据库查看/导出过程获得；文件内容必须是 context_payload 的 JSON 对象。
# 不要把生产数据库连接字符串、owner_id、明细或 JSON 值写入命令行/仓库。
node backend/scripts/auditSavedWeeklyContext.js < /path/to/private-v5-context.json
```

工具只输出 `checks` 布尔值及是否满足本地快照契约，不输出任何字段数值、证据 ID、文本或来源行。退出码 0 表示 `snapshot-contract-ready`，退出码 1 表示不满足。包含以下校验：已保存 `weekly-report-v2` 标记、13 个不重复的官方模块 ID、版本化清单、曼谷时间窗、授权业务 scope、证据数组、v5 Business Brain v2 的四产品/七阶段/待确认北极星意图，以及序列化投影不超过 22KB。

**重要：**通过该工具仅表示「快照结构可供下一步人工审阅」，不是 Phase 1 勾选条件的完成证明。它不会联系 Hologres、GSC、X、KOL、Worker、API 或 LLM；也不会确认输出报告引用的每个数字都与实时源一致。

## Phase 1 最终人工/真实来源验收

1. 在同一个受权 owner、同一个周报周期内，对照只读 Hologres/CRM/GSC/X 现有接口，逐项核查真实水位、源时间钟、完整性、注册/首次分析分母、真实交易匹配和缺失数据处理。记录来源与时间，不导出个人级记录。
2. 核实归档 journal 的 v5 prompt marker、模型调用记录（如已有）以及报告的 `weekly-report-v2` 七阶段 / opportunities / previousActions；未见过真正 v5 模型运行不得宣称实际模型报告验收。**不为验收而发起新付费请求。**
3. 核对 13 个模块的状态：`available`、`empty`、`not_synced`、`unavailable`、`not_configured` 等不能互相替代；`operations-timeline` 只陈述已保存的执行和非因果观察。
4. 请运营负责人确认「有效分析用户」的严格定义、是否将交易量作为独立结果、身份关联、观察窗口、适用产品范围和未归因处理。在明确签字/记录前保持 `operator-direction-not-a-validated-composite-kpi`。
5. 只有上述真实业务证据和负责人确认的材料均可追溯，才在 `GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` 将相应 Phase 1 项勾选。仅有快照投影、网页显示历史成功报告或绿色 CI 不足以勾选。

## 2026-10-31 当前侧栏观察（只读）

在选中的本地 AI Growth Agent 页可见一条**归档的** 2026-10-19 至 2026-10-25 周报，标识 `aggregated-business-v4`，覆盖清单 12 模块，历史覆盖未验证，产品到交易只读查询失败或超时。这证明页面能展示既存历史分析，不证明 v5 13 模块上下文 / 当前真实来源健康。这里不复制账号、证据 ID 或业务数值入仓库。

参见 `GROWTH_AGENT_HANDOFF.md`、`GROWTH_SOURCE_CONTRACTS.md`、`LOGEARN_BUSINESS_BRAIN.md`。