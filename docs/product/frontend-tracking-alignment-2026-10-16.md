# 产品前端埋点与增长后台对齐清单

日期：2026-10-16，Asia/Bangkok。

## 证据与边界

用户提供分享链接 https://chatgpt.com/s/cx_6ad1dae918708191aae81cf9cbe0b3ff ，浏览器显示 Shared chat not found，尚未读到分享分支内容。以下依据当前增长仓库、相邻 ../logearn-web 本地源码和已有入库核验记录；不代表已与分享分支负责人达成一致。本次未改产品代码、未部署、未刷新生产数据库。

链路：产品真实动作 → 产品 adapter/信封/队列 → collect 接收与校验 → growth_events 入库 → 增长后台去重、身份关联、事件映射 → 指标和用户下钻。只有前端函数调用不足以证明链路打通。

## 本地产品实现复核（用户确认以 logearn-web 为对接对象）

本次实际检查 ../logearn-web 的 master，HEAD 为 1cb1af63d，检查时工作区干净。无需再等待分享链接，可直接以本地源码开展对齐；当前 checkout 不等于已部署版本。

- 权威说明：src/plugins/logearn_growth/README.md。业务侧仅调用 window.logearn_growth_track；字段提取与关联在 adapter/state 中处理，不能为埋点改写业务对象或侵入策略引擎。
- app.vue 安装 dispatcher；events/ 注册真实事件；context.ts 生成固定14列信封；index.ts 合并 properties、页面关联、当时视口；transport.ts 发送到 https://api.logearn.com/logearn/growth/collect。
- 正常发送为 gzip JSON 数组，25条触发或5秒定时发送；pagehide 用未压缩 JSON Beacon；失败 outbox 上限500，超过丢最旧事件。Beacon 返回 true 只代表浏览器接收发送请求，代码未等待服务端入库确认；不能宣称保证送达。
- 增长后台 backend/src/data/hologres.js 默认读取 growth_events；analysisUsers.js 从 eventMap.js 取有效分析事件集合。产品 collect 接收服务不在这两个已检查模块内，仍需服务端/数据库样本验证。
- 真实业务调用已找到：app.vue 页面/首访/未登录打开；metamusk.ts 登录；榜单点击；详情呈现；analysis/service.ts 下钻成功；策略页启停；PnlHitCard 信号查看。不能把旧需求清单中所有事件都当成产品已接线。
- 产品明确接受“移动端登录按钮暂不采集”，不把它自动列为缺陷。策略 signal_viewed 的 run_id 维持尽力关联，不能推翻已接受的可选约定。
- 新发现需对齐：产品 README 将历史缺 login_type 的事件按旧版主动登录处理；后台 PAGE_URL_TRACKING.md 明确保留未知。建议历史类型继续未知，主动登录转化仅使用明确 manual，双方确认后同步文档与查询。
- viewed 的 DOM 时序风险仍存在：_price_distribution/index.vue 更新 display_data 后立即检查 chipRootRef；visibility.ts 仍只判断 isIntersecting，未核对 >=0.5 或文档可见性。应分别修复首次节点观察与曝光判断，且不能用曝光替代成功完成的定义。
- 手动交易终态来自 WS status=4，3/6/7为失败；attempt 通过内存及token/wallet/时间窗匹配，需验证连续同币多笔、跨刷新和多钱包场景，缺失关联不可猜算成功率。当前上报主动排除策略自动交易，不能据此代表全平台全部成交。
- invite_link_copied 目前仅 source，不含标准 referral_link_id；复制动作不能直接替代 share_completed 或正式邀请绑定事实。

本轮只读核查和对齐记录已完成；未修改产品源码、采集服务或统计口径。

## 共同业务口径

北极星业务定义：UTC+7 自然日内，成功完成筹码分析或下钻的去重用户。当前后台兼容 chip_analysis_viewed、chip_analysis_drilldown 并集。重复操作不能重复计人数，但不能因此删除不同的真实行为。

产品当前 analysis.ts 仍将北极星定义成“看到筹码峰”，注释 SQL 仅统计 viewed，按 server_ts 分日；与后台并集、client_ts、统一身份、UTC+7 不一致。需要先确认完成与曝光如何区分，再共同调整触发和计算；不在单侧直接重命名事件。空结果应由业务确认，确认前单列；缓存成功结果可计；失败、轮询、AI 后台计算不能自动算用户主动完成。

## 对齐表

| 业务问题 | 产品端责任 | 数据/增长端责任 | 当前证据与待办 |
|---|---|---|---|
| 用户有没有访问 | page_viewed，真实页面或浮窗访问生成 page_visit_id | 保留 page_path/page_name/view_mode、访问关联和视口 | 10-15 PR #26 对接记录已核验页面事件入库；尚非本次实时核验 |
| 页面停留 | page_visit_ended 上报同访问累计 visible_duration_ms | 检查点取最大累计值，不相加；无记录显示未知 | end_reason 不证明真实退出 |
| 匿名到登录 | 持久 anonymous_id；登录带真实 user_id，保留匿名身份 | 权威身份关联，冲突不能随意合并 | login_type=manual/auto_restore 已接入；自动恢复不当主动操作 |
| Token 发现到分析 | 点击、详情、分析共用 token_visit_id，保留 chain/token/entry_module | 同次访问漏斗按 ID 匹配，不按时间猜关联 | 本地 drilldown adapter 仍只输出 token/chain/drilldown_type |
| 分析是否完成 | 在实际成功分支上报，明确空结果、缓存、曝光与后台计算 | 保留原始事件，按共同定义统计 | viewed 触发目前仍依赖可见性；与完成定义需对齐 |
| 异步分析归属 | 请求发起时冻结 Token、访问和入口上下文 | 按业务链 properties.chain 优先匹配 | 防切 Token 后旧响应被记到新页面；需端到端验收 |
| 会话怎么划分 | 共同约定不活跃边界并实现新 session_id | 解释显式 ID 与缺失时推断的差异 | 当前 context.ts 按标签页保存，无30分钟失活过期 |
| 获客从哪来 | 首次入口与本次会话入口分开；entry_module 为站内入口 | 固化首次归因与版本；未知不猜造 | 产品空 referrer 当前记 direct；不能据此证明直接访问，ref 参数不证明正式推荐绑定 |
| 策略是否使用 | 真启动报 strategy_started；真实查看报 signal_viewed | 结果生成由实际生成方报告；保留 run/result 关联 | signal_viewed 的 run_id 已按此前决定暂为可选，不重新强制；缺失不能做运行级关联 |
| 是否真正成交/绑定邀请 | 点击和提交只报过程 | 成交终态、USD金额、正式邀请关系来自可靠业务事实 | 前端行为库不能独立替代交易/用户/推荐事实表 |

## 公共字段与交付要求

沿用产品现有14列信封，业务扩展字段进 properties。event_id 表示一次真实事件，网络重试复用原 ID、发生时间、身份与业务上下文；新动作生成新 ID。client_ts 为发生时间，server_ts 为接收时间，两者不可混用；查询周期使用 [start,end)。客户端时间异常须显式处理，不能伪造时序。

每条事件对齐：事件名、业务含义、准确触发位置、属性类型/枚举、失败与缓存语义、去重粒度、责任方、部署版本、实库样本。现有 output/schemas/growth_events.v2.schema.json 是兼容契约，允许某字段缺失不等于对应漏斗分析已具备条件。以 README 末尾兼容修订为准，不能套用较早正文的必填清单。

## 联调验收

1. 匿名打开榜单 → 点击 Token → 详情 → 成功分析 → 下钻 → 登录：检查身份合并及访问关联。
2. 直达详情、浮窗、换 Token、缓存、失败、空结果、切后台分别执行；确认无错归属与重复计数。
3. 隐藏再回来、刷新、前进后退、30分钟后返回：验证页面访问、累计可见时长及约定的会话边界。
4. 网络失败重试：同一事件 ID 不变，落库与报表不重复；检查 collect 是否接受新增字段/事件。
5. 同一测试动作记录 event_id，逐层比对浏览器请求、collect 接收、数据库原始行、后台指标与下钻名单。交付脱敏 payload、event_id、版本和执行时间。

先冻结北极星语义并补下钻关联，再校验页面/登录/会话及来源；策略、推荐、交易按业务事实所有者分别联调。缺事件代表缺观测，不能直接解释为用户没使用。

## 给前端分支的对齐说明

我们增长后台依赖你们真实上报并入库的事件。请先对齐筹码分析成功、下钻、页面访问、登录和Token访问关联：统一事件触发语义、身份、时间以及 page_visit_id/token_visit_id/entry_module；下钻上下文在发起时冻结。页面与自动登录已有10月15日入库核验记录，按现有字段延续。北极星目前后台使用筹码展示或下钻用户并集，但业务定义是成功完成，与你们“看到筹码峰”的注释需一起确认。请提供当前分支/commit、部署状态和上述链路的脱敏事件样本，我们按同一 event_id 对照入库与报表验收。

参考：docs/SITE_METRICS_AUDIT_2026-10-12.md、docs/PAGE_URL_TRACKING.md（含10-15更新）、output/schemas/README.md、backend/src/analytics/eventMap.js、../logearn-web/src/plugins/logearn_growth/events/analysis.ts、../logearn-web/src/plugins/logearn_growth/context.ts。
