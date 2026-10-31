# Codex 接手：Growth Executive 剩余真实验收与待开发事项

> 写入时间：2026-10-31。唯一开发分支：`codex/ai-comprehensive-upgrade`。开始前 **先拉取该分支最新 HEAD、核对 `AGENTS.md` 与未提交修改**，不可覆盖用户工作区。本文是实操验收清单，不代表授权生产迁移、部署、付费采集、模型重试、外部通知、发推、KOL 私信、交易或合并 `master`。

## 0. 交接事实与已修复代码

请先阅读：
- `docs/ai/GROWTH_EXECUTIVE_UNIFIED_ACCEPTANCE.md`
- `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ai/GROWTH_V5_SAVED_CONTEXT_AUDIT.md`
- `docs/ai/GROWTH_PERFORMANCE_ACCEPTANCE.md`
- `docs/ai/GROWTH_AGENT_HANDOFF.md`

本轮后续补丁相对于 `8deebe0` 已做：
1. 修复同一证据失败调查无限重试、无核验证据却宣称 `evidence-collected`。
2. 拒绝跨来源/单位/指标定义/期间不相邻的调查证据；针对 `active_users`、`new_users`、`returning_users` 选择不同的只读调查模块。
3. 每条原因假设保留 `kind`、`moduleId`、受控查询结果、所属 owner 的可验证 evidence ID 和 `causalityEstablished:false`；工作台可读已有自动调查履历。
4. 修复已采纳后仍显示旧审批通知、没有真实执行便完成效果步骤，以及混用不同时期目标、多目标冲突选错目标、跨来源虚构受影响人数。
5. 只读调查插件加载失败不会阻断每日经营报告；内部交付步骤可由真人按顺序提交证据/交付物。
6. 增补后端 owner、幂等性、跨源比较、任务交付、研究失败隔离、提醒状态及前端回归。
7. 所有外部操作仍需既有授权；并未创建新的付费自动运行或生产写入通道。

不要重复开发上述功能；先用真实运行证据确认哪些确有缺陷，再作最小修复。

## 1. P0 — 本地数据库迁移及一致性（环境操作，未授权生产）

- [ ] 确定 API、Scheduler 与 Worker 使用的是**同一个预期 SQLite 工作区**，避免不同 `DB_PATH` 导致“后台 0 个目标/问题”。
- [ ] 验证 Node >=22.5、SQLite `gw_*`、PostgreSQL AI DB、Redis、Worker、Hologres 只读连接与 owner 配置。不得将凭据提交或复制到报告。
- [ ] 在**隔离的开发数据库**验证幂等迁移及既有资料不被破坏。先备份；已授权后可执行如下示例，路径需由实际环境确认：

```bash
cd backend
DB_PATH=/path/to/approved/staging-analytics.db GROWTH_WORKSPACE_SCHEMA_APPROVED=1 node scripts/migrateGrowthWorkspace.js
```

- [ ] 核实 `gw_executive_notices`、`gw_executive_workitems`、`gw_runs`、`gw_actions`、`gw_evidence`、`gw_problems` 表；重跑迁移无重复，旧记录未丢失。
- [ ] **生产迁移未授权**：生产备份、切换时间、审批以及恢复演练都须另行确认。

## 2. P0 — 自动调度与授权范围

- [ ] 先仅对指定测试 owner 启用 `AI_AUTONOMY_OWNER_IDS`、`GROWTH_WORKSPACE_DISCOVERY_ENABLED=1`；`AI_AUTONOMY_PAID_DAILY_ENABLED` 必须保持关闭。
- [ ] `GROWTH_EXECUTIVE_RESEARCH_ENABLED=1` 才尝试至多三个只读授权模块。用实际 Worker 日志验证 **0 付费/外部写操作** 和至多一次同源快照调查；源查询失败要输出 `partial/unavailable`、不覆盖日报、不能泄露错误详情。
- [ ] 检查调度租约、重复任务、重启和多个 Worker 的 owner 隔离；每次都要有真实完成/延期状态与可追溯的持久记录。
- [ ] 真实费用/限额从既有账本读取；未知中转站花费保持未知，不以 `0` 代替。

## 3. P0 — Growth Agent 2.0 最后 1 项：真实 v5 上下文

- [ ] 从**已经存在**的授权 owner 周报记录选择一个真正 `weekly-report-v2` / 13 模块的已保存快照；历史 `aggregated-business-v4` / 12 模块不能充当通过记录。
- [ ] 先点击页面的“检查 v5 快照（只读）”，或按 `GROWTH_V5_SAVED_CONTEXT_AUDIT.md` 使用 `backend/scripts/auditSavedWeeklyContext.js` 处理**私有**存档。
- [ ] 逐项核验业务时间段、来源状态、13 模块、22KB 聚合优先上下文、运营记忆、四产品/七阶段、原始 journal 中 `token-efficiency-v5`、数值与证据 ID 路径。
- [ ] 复核 `active_users` 统计期内筹码峰查看/下钻去重人数及真实埋点覆盖；账户跨设备身份稳定性未证实之前不臆测去重。
- [ ] GSC/X/KOL `available`、`empty`、`not_synced`、`unavailable`、`not_configured` 不混淆。真实交易身份无法匹配时，排除已验证关联交易，记为异常，不填 0。
- [ ] 不为通过这项而盲目启动新付费模型调用。若没有既存真实 v5 存档，按“**阻塞：无已存档 v5**”报告并申请单独授权；不要把旧 v4 改标签凑数。
- [ ] 完成后附匿名化/脱敏验证证据；仅真实来源+日志/结果均可追溯才可将原进度 `47/48` 改为 `48/48`。

## 4. P0 — 完整的人机协作闭环

- [ ] 在开发环境证明 `可信指标下降 → 问题 → 自动多假设调查 → 有界证据记录 → 内部行动建议 → 人工采纳 → 三步执行清单 → 实际执行记录 → 到期同口径复盘 → 学习`。
- [ ] 验证 `gw_executive_workitems` 的三个步骤：证据核查 → 交付计划 → 实际执行结果。步骤二填写可审阅交付摘要，步骤三必须存在**人工确认的真实已执行状态**，并提交执行后的成熟证据，不能凭空报完成。
- [ ] 复盘须使用相同的 metric、definitionVersion、unit、scope、source 和有序不重叠观察期。没有对照/不能确认因果只能报告观察变化。
- [ ] 观察到相同动作多次不利结果，可停止无变更的重复提案，但不能禁止新的原因假设。
- [ ] 页面目标：运营负责人 30 秒内能识别最重要问题、AI 查到了什么、待我批准什么、下一步是谁处理。检查错误、空状态、提醒已知悉、步骤操作、加载不回跳顶部。

## 5. P1 — 仍需真正的产品设计/数据接入工作

- [ ] **目标权威源**：`gw_goals` 是月目标、`ai_growth_agent_targets` 是独立每日目标。当前仅只读核对，没有跨 PostgreSQL/SQLite 的原子目标编辑与统一冲突治理。请先提交变更/迁移与回滚设计、对齐目标版本及周期。避免无事务保障的双写；不要直接改生产表。
- [ ] **多步骤深度自主分析**：已支持按三种核心指标动态选择前三个只读模块、保存假设与可核验证据，**不等于根因已证实**。下一阶段在保留预算/owner/证据网关下支持区分性追问、跨调度周期调查与证伪路径；无可比数据时明确阻塞。
- [ ] **任务系统关联**：内部执行清单与已有 `operation_tasks` 为不同用途；可用已有 `gw_operation_links` 关联真实活动任务。验证人员负责、交付物、逾期与状态一致性，避免出现第二个 CRM 或假执行。
- [ ] **收益/投入评估**：`executivePortfolio` 现为证据优先排序。真实 ROI、增量用户、经济成本、投入工时、实验因果评价尚无可信数据时必须为 `null/unknown`；建议实用的证据齐全后再开发，不用历史差值制造可比较回报。
- [ ] **学习与实验**：成熟复盘只能得出观察变化；只有真正有对照、口径可比的实验才允许更强效果判断。人工审批与回滚继续独立于 Agent。
- [ ] **站外通知**：既有授权 owner Webhook + `GROWTH_EXECUTIVE_EXTERNAL_REMINDERS_ENABLED=1` 才可外发。当前未曾真实发送。按批准的测试端点验证最小化 payload、HMAC、幂等、陈旧提醒取消、重试及失败回放；未经授权不进行测试发送。

## 6. P1 — 性能、质量和发布前测试

- [ ] 仓库根路径及适用 `AGENTS.md` 确认；同步最新分支。建议先执行以下**不付费本地**测试：

```bash
cd backend
node --test test/growthExecutiveCycle.test.js test/growthExecutiveInvestigation.test.js test/growthExecutivePortfolio.test.js test/growthExecutiveWorkItems.test.js test/growthExecutiveOutbox.test.js test/growthWorkspace.test.js test/growthWorkspaceHttp.test.js
```

- [ ] 执行全套 AI infrastructure CI、frontend/UI regression，并检查运行的 **HEAD 与分支 SHA 一致**，不要用旧 CI 作证明。
- [ ] 在授权开发环境测真实 P50/P95、SQL/索引、SQLite/Redis/Worker CPU 和内存、Hologres 查询成本及 Token；数据源时间窗、owner、冷热缓存应一致。没有实测不写“优化 XX%”。
- [ ] 确认工作台真实运行的是此分支的新文件，而不是本地旧 v4/缓存前端。不要因为页面已有旧 12 模块报告就断言新 v5 已通过。

## 7. Codex 提交/签收格式

请提交：
1. 分支与最终 `HEAD`；所有改动的 commit 链接。
2. 每项任务单独状态：`代码完成 / 测试通过 / 真实验收通过 / 阻塞`，不能只用一个“完成”。
3. 真实 owner-隔离及安全回归、CI 链接、实际来源水位时间、已保存周报版本、真实操作证据（只提供脱敏信息）。
4. 允许变更及批准证据（如生产数据库迁移、付费调用、对外通知、部署），未批准的项目列为待授权，不擅自代替用户批准。
5. 本文勾选更新、`GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` 和 `GROWTH_AGENT_HANDOFF.md` 同步更新。确认过的数据才关闭任务。
6. 不合并 `master`，不提交凭据、用户 ID、原始钱包或事件级数据。

**完成定义：**既有代码回归 + 真实授权环境来源和链路证据 + 可由运营负责人复核的结果。没有生产权限不必阻塞代码交付，但必须单列无法独立签收的事项。

## 2026-10-31 本地授权验收记录（部分）

- HEAD `e16bdb11dee9211c1a8cde0f96e612356a78825d`；本地存在未提交的指标注册与回归夹具修复，测试结果不能视为该提交的远程 CI。
- Node 23.11.0。运行中的本地 API、AI Worker 和 PostgreSQL 存在；默认 SQLite 缺少 `gw_executive_notices`、`gw_executive_workitems`。现有运行环境的数据用途与迁移目标尚未确认，未在该库执行迁移。自主调度 owner、发现、付费日任务、研究和外部提醒的配置文件开关未启用；未证明运行进程全部有效配置一致。
- 对现有 SQLite 执行一致性只读备份，在隔离副本连续运行两次迁移：六张指定表齐全，表数由 111 至 113，`quick_check=ok`。这不是生产迁移或生产恢复演练。
- 临时独立 PostgreSQL 和独立 Redis 实例上，`aiMigrationIntegration`、`growthAutonomyIntegration`、`growthSharedRedisIntegration`、`workerLeaseIntegration` 四项通过；验证了迁移回滚与幂等、测试 owner 隔离、缓存隔离、租约 fencing 和模拟重复投递。测试后临时实例和数据库已清理；不证明真实 Worker 拓扑或真实操作闭环。
- 本地 AI 数据库只读检查：11 条历史周报，其中 5 条 completed；已完成记录的 10 个可解析 context/snapshot 均未包含 `weekly-report-v2`，快照审计通过数为 0。真实 v5、真实来源和模型 journal 验收仍阻塞，47/48 不变。
- 前端 442 通过、4 跳过，构建成功；Executive 定向 39 项及本轮相关 42 项通过。后端全量 `NODE_ENV=test npm test`：1072 通过、17 失败、16 跳过；剩余失败涉及耗时、预算、周报接口、13 模块预算断言及漏斗契约，发布前必须逐项核对。不可关闭全量测试项。
- 未执行生产迁移、付费采集或模型调用、外部通知、部署或合并；真实 Hologres/GSC/X/KOL、执行交付与复盘、P50/P95、费用和 UI 人工验收均未通过。

## 2026-10-31 唯一环境授权后的实际操作

用户确认只有一个环境并授权全部操作。对该环境默认 SQLite，在执行迁移前通过 SQLite 在线备份取得一致性副本，备份和迁移后的 `quick_check` 均为 `ok`。按原迁移脚本连续执行两次成功；六张指定表存在。备份保留在该环境的 `backend/data/backups/`，禁止提交。此记录覆盖上一节中“尚未迁移运行库”的状态，不等于恢复演练完成。

本地 AI PostgreSQL 和 Bull 使用的本地 Redis 可连接；只读 Hologres 连接可用。实际只读北极星观察返回 `history_complete=false`、`events_complete_through=null`，查询截至 `2026-10-31T16:14:44.034Z`，因此覆盖未验证，不可声称真实下降或执行效果。运行中的 API 和 AI Worker 启动于本次分支同步之前，尚未证明运行代码与当前 HEAD 一致。配置文件未启用自动发现、指定 owner 或付费日任务；没有改变这些开关。尚未发起付费模型调用或外部通知。

没有已存档 v5 快照，且真实来源覆盖未通过。避免把新生成的报告自动等同于真实来源验收；必须先解决来源水位和后端全量回归，并确认实际运行代码后再进行有界生成与人工核对。原 47/48 保持不变。未宣称实际人机闭环、P50/P95、真实费用或发布验收通过。

## 2026-10-31 回归与运行进程复核

- `NODE_ENV=test npm test`：1105 项，1089 通过、0 失败、16 跳过。此前 17 个失败均定位到测试夹具/断言未跟上当前契约：证据采样时钟（1）、Token 预算事前拦截及恢复预算（5）、周报接口依赖/请求夹具（6）、13 模块覆盖与有界计划（4）、末级漏斗及成熟分母展示（1）。预算测试明确断言超预算前不发付费请求；这不是放宽费用门禁。未发现这些失败本身需要改变生产逻辑；不代表没有其他缺陷。
- Hologres `status()` 的未知值是明确的保守设计，不由最新事件时间推算完整性。只读元数据检查未发现可识别的采集完整性/水位或检查点表；尚无独立证据证明历史完整或事件完整截止时间。保持 `history_complete=false` 与 `events_complete_through=null`，不得将其强制设为通过。
- API、AI Worker、前端与本地 Redis 在确认 AI 队列及待处理记录为空后重启；API `/health` 正常，Worker 已注册任务并就绪，进程启动于当前 checkout HEAD `574a1bd` 之后。该次测试修订仅涉及测试文件；运行进程未证明未来提交的 SHA，也不是部署验收。
- 只读检查既有周报对应 owner，X 官方内容与快照存在，但数据存在不证明完整或归因；workspace action 数为零，尚无运营执行记忆可验证。无既存 v5 快照，真实 13 模块与模型 journal 签收仍未完成，47/48 不变。

## 2026-10-31 数据可信度与 v5 端到端验收准备

| 检查 | 状态 | 证据与边界 |
| --- | --- | --- |
| 上游采集、重试与回填 | BLOCKED | 产品端有批量传输及本地有界 outbox；接收服务、逐条持久化确认、死信/重试和回填证明不在本仓库或当前可见数据库。客户端可丢失事件，无法从目标表推断全量。详见 `GROWTH_INGESTION_CHECKPOINT_PLAN.md`。 |
| 事件/到达/快照/完整水位 | PASS（定义）/ BLOCKED（完整水位） | 分别为 `client_ts`、`server_ts`、`snapshot_cutoff`、独立核实的全分区完整时间；前三者不证明第四者。可见元数据未发现增长采集检查点，当前源码保持 false/null。 |
| 首次、回访、跨设备去重 | BLOCKED | 匿名 ID 为浏览器本地；SQL 仅将无冲突的匿名 ID 合并到账号。历史与跨设备关联无法独立确认，首次观测不能作为真实首次。 |
| 检查点消费者的独立结构校验 | PASS（离线代码） | `ingestionCheckpointContract.js` 只检查结构并始终返回来源未验证；从未接入 Hologres 状态。分区不全、过期、失败或待重试均不生成候选水位。不能替代采集者提供的真实证明。 |
| API / Worker / 前端版本 | PASS（代码等价） | 进程均在 `574a1bd` 后启动；`574a1bd..c7c5ba6` 对运行的后端源码、依赖和前端无差异，API 健康。进程无构建 SHA 自报，故证明源码等价，不是进程自报完整 SHA。 |
| 13 模块真实 v5 和 journal | BLOCKED | 当前 owner 没有已保存 v5；最新可用旧存档仅 12 模块：增长、SEO、渠道、激活、留存、推荐和登录标为 collected；交易、合作账本、X 内容及粉丝质量为 insufficient；KOL 为 not-investigated，运营时间线不存在。旧状态不代表实时来源通过。无 v5 journal 或真实 v5 22KB 投影可审计；旧原始存档字节数不等于投影字节数。 |
| 单独来源只读检查 | PARTIAL | 既存 owner：GSC 设置和 API 快照各 1，KOL 快照、CRM KOL、运营行动均为 0，X 内容及快照分别 21/20。仅是存在性计数，不证明期间匹配、采集完整、关联或因果。未发起采集或付费模型调用。 |
| CI | PASS（基线 SHA） | `c7c5ba65fe8c5d9cbeb2fa728c707ea2fb3c5c71` 的 [AI infrastructure](https://github.com/dinnelthai/logearn-growth/actions/runs/41219608758) 成功。后续提交的 CI 状态须以对应 SHA 的运行结果为准。 |

真实来源与真实 v5 验收均未通过，原进度仍为 47/48。对外信息仅记录聚合状态，不记录 owner、凭据或事件明细。
