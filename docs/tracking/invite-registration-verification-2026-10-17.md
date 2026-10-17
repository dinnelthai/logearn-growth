# 新增注册邀请闭环验收

日期：2026-10-17，UTC+7。范围：本地 logearn-web 打点、增长后台读取与判定代码、真实数据库只读聚合。未修改业务代码，未部署，未创建真实账号。

## 结论

未通过用户要求的验收：后续携带 referral 的新注册账号，其链接邀请码反查出的邀请人必须与数据库实际邀请人一致，才能记注册邀请成功。

## 已有能力

- web invitation.ts 发送 invite_link_visited，登录尝试携带 invite_flow_id。
- 登录成功事件保留 anonymous_id，带真实 user_id 与关联 flow。隔离测试验证此路径。
- 数据库有 account_v2.account_id/invite_code/created_at 和 user_invitation_relation.user_id/level1_user_id/invitation_time/is_valid。

## 阻断项

1. 邀请码证据未贯通：web 入口只发 flow 和 invite_code_present；context.getPage() 只发 pathname。后台 conversionFacts.js 仍从 page 或 first_landing_url 提取 referral，不能从当前显式入口事件得到码的比较键。隔离复现结果 identity_only，不能证明邀请人一致。
2. 后台没有邀请码独立反查：invitationRelations() 将关系表 inviter_referral_code 转比较键，未通过 account_v2.invite_code 反查账号再与 level1_user_id 比较。当前判断是入口码与关系记录码一致，不等价于用户要求。
3. 未限制本次新注册：关系校验只要求 account_created_at <= bound_at，不要求账号在本次邀请入口之后创建。登录事件 is_new_user 未进入 conversionFacts 的字段投影。隔离反例中入口前已存在的账号、本次绑定、码一致仍返回 matched。matched 当前文案是关系匹配，不应解释为注册邀请成功。
4. 显式漏斗依赖未发送的事件：inviteConversion.js 的校验/绑定步骤要求 invite_validation_finished 和 invite_binding_finished，当前 web invitation adapter 没有发送它们。若采用后台数据库完成校验，应调整漏斗数据来源，不依赖前端宣称绑定成功。

## 验证证据

- web：node --test scripts/tests/logearn-growth.test.cjs，59/59 通过。
- 后台：inviteAssociation.test.js，11/11 通过；conversionFacts/conversionScenes/conversionRoutes，20/20 通过。现有用例通过不表示新增业务标准通过。
- 真实库最近7天（按查询时 NOW）：目标事件集合仅查询到 login_succeeded 446条，其中 is_new_user=true 22条，携带 invite_flow_id 0条。未查询到 invite_link_visited、login_attempt_started/finished、invite_validation_finished、invite_binding_finished。最新登录接收时间 2026-10-17 10:35:17.814 UTC+7。
- 无新版邀请流程的入库样本，无法宣称真实端到端成功。未用模拟数据写入生产来制造证据。

## 后续验收条件

- 确定前瞻校验生效时间，不回溯历史；该时间之后的新入口单独统计。
- 入口产生可供后台独立反查的邀请码证据（如一致算法的码摘要配合数据库侧计算或可信服务端解析），并与 flow、登录后的真实账号关联。
- 使用业务账号注册事实判断本次新注册，已有账号登录不得进入注册成功数。保留时钟偏差及无法确定时的待核验状态。
- 码只能唯一解析到一个邀请人；解析结果与有效一级邀请关系一致，且非自邀，才成功。
- 区分成功、已有账号、不一致、无效码、待写入、查询异常；前端登录成功不直接等于注册邀请成功。
- 需一条真实新增注册路径证明 web -> 采集 -> 数据库 -> dashboard 成功，并验证已有账号和错误码反例。


## 后续实施

以上为修复前审计证据。用户要求补齐后，已实现 web v4 摘要打点、后台独立码反查、新注册判定及 dashboard 展示，详见 [实施记录](invite-registration-implementation-2026-10-17.md)。历史入口不回算；发布后真实新增注册验收仍需执行。
