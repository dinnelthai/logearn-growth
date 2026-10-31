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
4. **已完成运营负责人确认（2026-10-31）**：唯一北极星是统计周期内查看筹码峰的去重用户数，N 次查看仍计 1 人。真实交易是其他结果指标，不定义北极星交易关联时间窗；身份无法可靠匹配的交易不纳入已验证用户关联指标并标记异常。原 `operator-direction-not-a-validated-composite-kpi` 标记仅防止创建未经定义的复合 KPI；真实事件映射及身份稳定性仍须核验。
5. Phase 1 的运营定义签核已勾选，**真实 v5 来源验收仍未勾选**。需要真实业务证据与水位、存档的原始 v5 模型版本、模组和质量状态均可追溯，才可关闭最后一项。仅有快照投影、旧 v4 报告或绿色 CI 不足以勾选。

## 2026-10-31 当前侧栏观察（只读）

在选中的本地 AI Growth Agent 页可见一条**归档的** 2026-10-19 至 2026-10-25 周报，标识 `aggregated-business-v4`，覆盖清单 12 模块，历史覆盖未验证，产品到交易只读查询失败或超时。这证明页面能展示既存历史分析，不证明 v5 13 模块上下文 / 当前真实来源健康。这里不复制账号、证据 ID 或业务数值入仓库。

参见 `GROWTH_AGENT_HANDOFF.md`、`GROWTH_SOURCE_CONTRACTS.md`、`LOGEARN_BUSINESS_BRAIN.md`。

## 自动化回归证据

在代码提交 `0d3b508cb654e47352f8aa2926f1ba8b8b662e6c` 上，[AI Contract / Integration / Frontend CI](https://github.com/dinnelthai/logearn-growth/actions/runs/41205481012) 均通过。新测试覆盖 v5 正例、旧 v4 拒绝、重复模块/错误时间窗拒绝、异常输入不泄露内容。此结果仍不替代真实数据与负责人验收。

## 本轮新增：网页中检查已保存周报（不付费）

提交：后端 `878876528c2985bb70c802666174a318cdc20f41`，前端 `384c02c462acb59b3a3316bec54a18fabca28e7e`。

1. 同步/启动目标分支后，打开 AI Growth Agent → 周报与决策 → 选择已有周报记录。
2. 点击 **「检查 v5 快照（只读）」**。前端仅发起 `GET /api/growth-workspace/ai-weekly-reports/:id/snapshot-audit`（实际挂载路径以应用已有路由为准）；接口使用现有登录身份，按 owner 读取已保存 `ai_analysis_records`；没有写入/队列/LLM/GSC/X/CRM 操作。
3. `snapshot-contract-ready` 仅说明已保存快照的 v5 结构、13 模块、四产品七阶段和 22KB 预算检查通过；**不是**来源健康、最新指标、原始模型日志或运营结果可信度验收。
4. 如果展示“缺少已存档 v5 周报标记 / 不是完整的 13 模块”，说明当前选中的是 v4 或不完整的存档。不要点击“重新生成”来满足验收；该按钮可能调用付费模型，且会创建独立任务。
5. 如已有合格 v5 快照，随后人工核对来源水位、实际 `active_users` 去重身份、交易匹配异常、13 模组取数状态，以及原始 journal 的 `token-efficiency-v5` 和模型结果证据。保留只读审计时间与结果，不公开原始业务快照。

本轮经浏览器**只读**查看的仍是 2026-10-19 至 2026-10-25 的旧 `aggregated-business-v4` 周报：12 模块、历史覆盖未证实、交易只读失败。因此没有真实 v5 验收成功记录，也没有发送新付费模型请求。

## 自动化验证边界（2026-10-31）

- [AI infrastructure run 41207439675](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439675)：**AI Contract、AI Integration、AI Frontend 全部成功**；包含新后端 owner 隔离、不付费、旧 v4 拒绝、损坏 JSON 不泄露，以及前端审计提示回归。
- [Frontend UI run 41207439672](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439672)：**失败**，在未修改的 `frontend/src/analytics/__tests__/funnelAssociation.test.js` 发现 `drop_off_users` 预期 1、实际 0。与本轮周报审计文件无直接重叠；未证明其为历史遗留或无关业务缺陷。不能声称全站测试完全成功。
- 当前验收清单：**47/48（97.9%）**。已完成代码/CI 与运营指标定义；仍缺真实源 v5 快照及模型记录的人工可追溯验收。
