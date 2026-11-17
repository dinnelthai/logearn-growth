# Growth Agent：聚合统计模型边界与真实验收清单（2026-10-28）

## 核验基线

- GitHub master 起点 `e5370ca`，保留用户列出的五个提交；`e5370ca` 已包含产品链路总体统计摘要。
- 已由操作者说明独立 `logearn_ai_dev` 的 AI migration/Redis/Worker/Terra 和 Token 台账曾通过；**本 PR 没有直接连接到这些本机服务**。
- 历史失败任务 `791c561b-a26c-46e8-bb60-2e4173a49f6d` 在产品链路补查期间出现结果超限，状态需从实际 DB 再查。严禁自动重放。
- AI 分析前端完整展示、真实任务从 pending 到 completed、实际费用审计 API 一致性：仍需同环境登录后的实测。

## 模型数据边界

1. `businessReport` 与内部分析 Job 继续使用原始业务数据计算统计。对于已有运行，Postgres 的 `data_snapshot` 与 SQLite 的原始检查点继续承担持久化及审计责任。
2. `modelTransport.modelContext` 在**首次 LLM 请求前**对白名单汇总做投影：两个业务日窗口和当前/对比统计、渠道与成熟队列、质量水位、分子分母、候选问题与证据 ID、能力目录。历史内部操作文本、列表、用户级与事件级结构不传入模型。
3. `tools/registry` 对运行结果执行相同正向统计投影后，才保存到 Agent 的新证据记录。主业务结果仍归业务分析任务所有。来源、设备、漏斗步骤和产品链路的统计保留，原始 `rows`、用户/钱包、session/cookie、成员数组等不传入。
4. `modelEvidence.forModel` **每次**投影，而非只在结果超长时触发。模型只收到不可变的证据 ID 与摘要，`null` 保持未知，遗漏标记为遗漏。
5. 模型每轮补查最长 6 KB 统计结果；初始上下文最大 22 KB。摘要会优先保留主要指标、质量和证据身份，后续报告不得把遗漏算成零。
6. 已有的 owner、来源、业务日、查询次数、候选人数、结果大小限制保持；400/403/422/429 变成有原因的不可用证据供模型安全结束，不扩权、不自动重新发起超限的请求。
7. 调用记录增加实际请求 `max_tokens`、中转商报告的 `outputTokens` 和是否超过请求值的差异标记。**不据此推断为何出现差异，也不会为了复核自动重放付费调用**。

## 只读检查现有任务

在确认本机 `backend/.env` 正确并将本 PR 的代码更新到本地后，由操作者在 backend 执行：

```bash
node scripts/auditBusinessAnalysisE2E.js <OWNER_ID> 791c561b-a26c-46e8-bb60-2e4173a49f6d
```

输出不会包含模型提示、用户数据或连接密钥。其检查项只会给出 `PASS`、`FAIL` 或 `BLOCKED`。它是读库验收，不是给之前失败的任务复活、补记账、或触发重试。

## 新任务真实验收（只有操作者能在本地执行）

1. 检查 `ai_analysis_records` 中是否存在 processing 的执行租约及 `ai_analysis_call_guard` 的 `started/unknown`，检查队列活动与 Worker 状态；不对模糊状态重试。
2. 确认本地部署的是此统计投影版本，重启一份必要的 Worker（不能并行启动旧进程）。
3. 通过 UI 手动创建一次小范围**新的**激活分析（非旧任务重放），记录真正的 analysis ID、时间范围、focusGoal 和 source。
4. 确认待处理→处理→完成，`result.summary`、`evidenceIds`、`ai_suggestions` 存在，调用记录包含 `modelTransportVersion:aggregated-business-v1`。
5. 运行单任务只读检查，确认 `ai_usage_logs` 的 owner/operation/trace 匹配、Token 与金额可追溯，并与 `GET /api/ai-analysis/growth-agent/cost-audit?days=7` 及 relay 控制台金额核对。中转站金额不确定时明确保留偏差。
6. 登录前端核对分析详情/建议实际显示，记录任何页面/API 错误。前端不可访问时必须记录为 `BLOCKED`，不能因 DB 完成就宣称 E2E 完成。

## 测试与不确定性

- PR 专项 CI 是代码级、模拟源数据与测试 PostgreSQL/Redis，不是本机 `logearn_ai_dev` 或真实 DeRouter。
- 新统计模型输入可能改变旧 Agent 提示词的数据密度。历史正在运行的付费任务不应盲目恢复：先审计 trace 与共享状态，再决定人工处理。
- 主业务统计口径不做改变；如需要进一步增加渠道维度或成熟队列分母，优先扩充白名单统计字段，不放开原始成员或事件明细。
