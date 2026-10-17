# logearn-web 与 Dashboard 契约核对

核对日期：2026-10-16。产品端：`logearn-web` 的 `events` 分支，提交 `ae123aad25a7a4e35ed7dac07f5ba62b52104593`；Dashboard：当前本地工作区。仅检查产品端，未修改产品代码。

## 结论

已实现事件的主要名称、关联 ID、结果枚举和耗时字段匹配。Dashboard 预留的完整邀请漏斗与登录阶段诊断超出了产品端本批交付范围，不能认定整条链路已经对齐上线。

| 场景 | 产品端实际契约 | Dashboard 对应处理 | 结论 |
| --- | --- | --- | --- |
| 页面停留 / 首屏停留 | page_viewed、page_visit_ended、page_engaged；page_visit_id、visible_duration_ms | 同一次页面访问累计时长取最大值，不累加检查点；首屏为会话入口页面可见停留 | 一致；不是首屏渲染耗时 |
| 首页跳出 | 10 秒 page_engaged、后续页面、明确互动与离开事实 | Dashboard 计算；隐藏、pagehide、缺失终态不直接判跳出 | 一致；未知样本不当作跳出 |
| 分析尝试 | analysis_requested / analysis_request_finished；analysis_request_id；success/empty/failed/cancelled | 发起批次、明确终态、独立耗时及错误维度 | 一致 |
| 分析曝光 | chip_analysis_viewed 可沿用 request ID，使用实际曝光页面与身份 | 北极星沿用 viewed / drilldown；请求诊断使用 requested / finished | 一致；不可强求曝光上下文等于旧请求 origin |
| 卡片曝光与点击 | item_id、item_exposure_id、page_visit_id；快速点击可能没有 exposure ID | 仅按明确曝光关联；没有曝光 ID 的点击不补造曝光 | 一致 |
| 手动登录尝试 | login_attempt_started / finished；login_attempt_id；success/failed/cancelled | 同 ID 关联，自动恢复与手动事实分开 | 一致；Telegram 外跳和未启用 Google 入口无完整尝试覆盖 |
| 核心内容加载 | page_content_load_started / finished；page_load_id；ready/failed/cancelled | 单独统计加载耗时；允许终态补目标 page_visit_id | 一致；不能用空 DOM/骨架判 ready |
| 邀请入口及登录关联 | invite_link_visited；invite_flow_id；登录起止及成功可补同一 flow ID | 转化加载器已保留 flow ID，入口流程可识别 | 基础契约一致；无法证明邀请码有效 |
| 邀请校验 | 尚未实现 invite_validation_finished | 预留 valid/invalid/failed、validation_attempt_id | 缺后端明确校验契约及事件 |
| 正式绑定 | 尚未实现 invite_binding_finished，登录 API 未透传 flow ID | 必须与关系表核实 relation_id、邀请双方和时间 | 缺权威绑定结果及可靠流程透传 |
| 登录逐阶段 | login_attempt_stage 仅内部状态，不发送 | 等待 login_stage_started / finished 和 stage_attempt_id | P1 尚未交付；error_stage 仅支持失败位置 |

## 必须保留的解释边界

- 邀请漏斗的账号确认步骤依赖校验有效证据。当前只有入口与登录关联时，不能将该漏斗视为完整的“邀请访问→登录”报表；手动登录总体仍可在登录转化页独立分析。
- referral_link_id、inviter_user_id、campaign_id/activity_id 暂无可靠供给，相关维度保持 unknown。不能从 URL 邀请码推断邀请人，不能按时间接近补关联。
- 关系表可以独立统计有效绑定事实，但缺少 flow ID 时不能归因到某次入口、链接或活动；独立事实不受链接/活动过滤影响。
- retry_of_request_id 未由产品端发送，Dashboard 不应把重试空数据解释成没有重试。
- 同标签页刷新仅在产品端能确认时恢复流程；跨标签页、跨文档外跳缺关联保持未知。统一身份映射不能替代明确 flow ID。

## 验证

Dashboard 后端 212/212、前端 228/228 测试通过。核对依据为产品端 invitation.ts、events/auth.ts、events/analysis.ts、events/content.ts、events/cards.ts、events/navigation.ts，以及 DIAGNOSTICS_HANDOFF.md、INVITATION_HANDOFF.md；Dashboard 对照 conversionFacts.js、behaviorPaths.js 和对应分析器。

本次是本地源码及已有自动测试核对，未执行生产浏览器→collect→数据库逐 event_id 验收。产品交接文档仍标记尚未部署；diagnostics_version 不能代替发布版本和真实落库证据。完整邀请漏斗需补齐上述后端依赖后再联调。

## 数据库实查补充（2026-10-17，UTC+7）

只读查询截止 `2026-10-16T18:31:16.358Z`（UTC）。

- `public.user_invitation_relation`：6452 条、6452 位被邀请用户，全部标记 is_valid，全部有 invitation_time；6031 位被邀请用户能匹配 account_v2。
- 使用 Dashboard 现有 verifiedRelations 规则（双方账号、非零推荐人、非自邀、注册时间不晚于绑定、无循环或冲突）后可用 1965 条。其余 4487 条被规则排除，不能把表内 is_valid 单独当作分析可用性。
- 这 1965 位中，67 位可以按统一 user_key 关联已有行为事件，60 位观测到 login_succeeded，41 位观测到绑定后的 chip_analysis_viewed / chip_analysis_drilldown。均为累计已观测人数，不是邀请入口转化率；未观测不等于未使用。
- 目前数据库相关事件仅观测到 login_succeeded（379 条），均没有 invite_flow_id；未观测到 invite_link_visited、invite_validation_finished、invite_binding_finished、login_attempt_started/finished。
- 另有 `public.invitation_relation_change_log`：7 条变更、7 位用户，其中 1 条 old_inviter_user_id 非空且非零。当前关系可能被换绑，当前表不能直接证明历史登录当时的推荐人；此日志未纳入现有历史归因计算，完整变更覆盖尚未确认。

可可靠关联：当前邀请双方账号、绑定时间，以及对应用户的已观测登录和绑定后分析。Dashboard 已有关系事实加载器及推荐分析；邀请转化页也独立展示关系事实。

仍不可直接关联：某一次匿名邀请访问、有效邀请码校验、某条邀请链接/活动与最终关系。当前表和变更日志都没有 invite_flow_id，不能按邻近时间强行接入完整流程漏斗。
