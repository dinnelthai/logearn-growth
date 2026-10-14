# 全站埋点与北极星口径审计

日期：2026-10-12，Asia/Bangkok。范围：Logearn-growth 分析后台 + 相邻 logearn-web 产品源码 + Hologres 只读聚合。未修改业务代码、采集配置或线上数据库，未部署。静态检查不能代替生产端到端操作验收。

## 结论与业务基准

用户已确认北极星：**成功完成筹码分析或下钻的每日去重用户**。

当前问题不是两种事件取并集本身，而是事件是否确实代表“完成”、完成事件是否覆盖所有入口，以及各模式是否使用同一集合。实库模式核心北极星/漏斗/渠道/分群已大体采用展示或下钻并集；产品定义、部分 SQLite 计算、事件元数据及关联字段尚未统一。

正式基准应写为：UTC+7 自然日内，用户发起的筹码分析或下钻成功完成，按统一身份去重；同用户多次、多 Token、多入口只算一人。缓存命中成功结果可计；AI 引擎后台抓取、轮询、单纯点击、失败不计。空结果是否算完成尚待业务定义；在确认前单列 empty 状态。当前登录与可靠关联匿名身份共同计数，匿名计数是浏览器标识，不能宣称精准自然人数。

“完成分析”和“看到结果”应拆开：前者用于已确认北极星，后者用于结果消费与曝光转化。保留原始两种事件便于历史兼容，但要避免把页面曝光等价于用户主动完成一次分析。尚无证据表明这个指标已验证能预测留存或收入；这不影响将其作为当前正式使用指标。

## 本次只读实库证据

快照：2026-10-12 09:22:50 UTC+7。按 event_id 去重、排除 acc_，保留统一匿名关联口径。全已观测历史，共 14,578 条事件、259 个身份；不是全产品用户规模，覆盖完整性未确认。快照中未来事件为0。

| 事件 | 条数 | 去重身份 | 关联情况 |
|---|---:|---:|---|
| chip_analysis_viewed | 0 | 0 | 未观测 |
| chip_analysis_drilldown | 2,075 | 53 | token_visit_id 全部缺失 |
| token_detail_viewed | 4,109 | 126 | token_visit_id 4,109 条 |
| ranking_token_clicked | 2,048 | 92 | token_visit_id 2,048 条 |
| signal_viewed | 4,378 | 31 | 运行ID覆盖见快照 JSON |

下钻类型：full_lifecycle 1,046、circle_select 664、inner 365。53是全观测期用户并集，不是今天 DAA。每日必须重新按日期统计。

page_viewed、page_visit_ended、module_viewed、分享点击/完成/访问及钱包连接事件均未观测。源码也未找到这些事件的显式调用点；其中页面事件与较早审计所描述的“本地补接”不一致，须以当前 checkout 和实际部署版本重新确认。

证据：output/events-audit/site-metrics-audit-2026-10-12.json；完整事件清单：output/events-audit/site-event-coverage-2026-10-12.md。

## 明确问题与优先级

### P1：北极星完成口径与事件触发不一致

- 产品 events/analysis.ts:3–7 将北极星写成“看到筹码峰”，示例 SQL 按 server_ts 且仅展示事件；后台使用 client_ts、UTC+7、展示或下钻并集及身份合并。这是定义、时间与身份三处差异，不应照产品注释 SQL 直接做报表。
- 产品 _price_distribution/index.vue:98–104 更新 display_data 后同步检查 chipRootRef；节点由第122行 v-if 创建，第一次渲染前 ref 为空，之后 wasEmpty 为 false，可能永久漏掉展示。当前实库展示0支持排查，但不能证明唯一原因。
- visibility.ts:24 只判断 isIntersecting，不判断 intersectionRatio>=0.5，也不检查 document.visibilityState；30秒后停止观察，晚滚动到图可能漏曝光。这是曝光准确性问题；根据用户完成口径，不应让可见性决定所有完成事件是否计数。
- 分析 service.ts:418–423 接口成功、格式化后走到第472行下钻事件；无独立“结果有效/空数据”条件，无完成事件的 request/result 关联。明确“成功完成”是否包含无结果，否则会把空响应归为有效分析。

### P1：下钻缺业务关联，造成漏斗与入口分析失真

产品 events/analysis.ts:66 下钻 adapter 仅 token/chain/drilldown_type，不携带 token_visit_id、entry_module。当前2,075条全部缺访问ID。
普通用户顺序漏斗能把下钻视作 chip；同次 token_visit 漏斗不能确认它属于同一次详情访问。用户可能已完成分析，但关联漏斗显示缺关联/未到达。不能用用户时间邻近猜填ID。
修复应在下钻发起时冻结访问上下文，在异步成功后上报该上下文；不能在响应到达后才读当前访问，否则切 Token 时会错误归属。

### P1：当前产品遗漏基础浏览与发现链路

当前源码无 page_viewed/page_visit_ended/module_viewed 的注册实现及业务调用。业务事件信封 page 仅证明动作时页面，不能覆盖纯浏览或真正落地页。已登录自动恢复者又不发 login_succeeded，纯浏览更难观测。
搜索、详情Tab切换、钱包连接发起/成功/失败、holders/cluster使用、关注/取关等在后台有事件名称，但产品未检索到相应调用；按功能实际存在与业务必要性逐项补，不把事件清单当已实现。
邀请复制有调用但本次实库无记录；分享访问链路缺调用/归属事实，无法计算分享→访问→绑定转化。strategy_result_generated 归后端责任；因本次没有后端采集源码，当前只确认实库无记录，不能确认后端遗漏。

### P1：SQLite 与其他模式的有效分析集合不一致

- backend/src/analytics/comparison.js:172 的 analyzedSet 只认 chip_analysis_viewed；同文件 fresh 依赖包括下钻的 first_chip_at。只下钻用户可能被判“新分析”，却不属于“期间分析”。
- backend/src/analytics/referral.js:78 只查展示，虽然 first_chip_at 可以补第一次下钻，但绑定前已分析、绑定后只下钻的用户仍可能漏算；前端 referral.js 按 chip 并集。
- Hologres 用 remoteAnalysis 的 referralInsights，以上不能直接称当前线上推荐页错误；它们是 SQLite 模式和跨模式的一致性缺陷。SQLite 推荐页仍称 activated/advocates 为 K，Hologres 已区分传播产出，两种模式业务解释不同。

### P2：事件字典不是全站单一来源

frontend/eventConfig.js 与 backend/eventMap.js 手工双维护。程序对照发现19个前端事件未列入后端 RAW_TO_TYPE；其中 heartbeat 故意不入路径是合理排除，page_visit_ended 可有独立处理，但 language_changed、invite_link_copied 等需要明确能否进入行为时间线/路径。
EVENT_META 使用 type 作键，展示和下钻同为 chip，后一个覆盖前一个，实际 EVENT_META.chip 无 northStar:true。当前计算按 type 而非该标志，因此这是元数据缺陷，不应夸大为现有 DAA 直接少算。
产品用 drilldown_type，后台事件描述写 drill_type；产品 invite_page_entered 用 source，后台描述写 entry。需统一字段契约与枚举。

### P2：会话、首次来源、身份及观察覆盖边界

- 产品 context.ts:65 会话是标签页ID，无30分钟不活跃过期；后台显式会话尊重原ID，缺失才按30分钟推断。两个“会话”不可直接比较。需产品生成与后台解释统一，不改写历史ID。
- 产品空 document.referrer 判 direct；后台 tracking/firstVisit.js 的方案空来源保持未知。空 referrer 并不证明直接访问；另外产品可固化 internal 与未经验证的 ref 参数为推荐来源，不能当可靠获客归因。
- Hologres eventsCte 仅由 server_ts 限制到达截止，未统一过滤 client_ts 未来/非法范围；本次未来事件0，但各消费查询额外 as_of 过滤不完全一致，需统一入口校验。
- 首次观测分析不等于真正首次分析；无事件不能判流失。留存 complete 主要表示观察时间成熟，不能证明采集完整。当前远程 coverage 明确不完整，报表与下钻应持续保留此解释。
- 北极星和渠道包含匿名/未匹配身份，分群主要按注册账号，推荐要求双方匹配。这些池差异可以合理存在，但不得期待各页面人数无条件相等。
- 北极星每日 login_users 是有显式 user_id 的任意行为用户；“登录用户”标签易误读成 login_succeeded 用户。首页写“已登录访问用户”更准确，应统一文案。

## 已统一或合理不同的部分

| 模块 | 有效分析集合 | 主要差异 |
|---|---|---|
| 前端JSON北极星/分群/推荐 | 展示或下钻映射 chip | 依赖前端标准化与历史事实 |
| SQLite北极星/事实rollup | 展示或下钻 | 对比与推荐有残留单事件逻辑 |
| Hologres北极星/漏斗 | 展示或下钻 | 统一 user_key、UTC+7；关联模式要求ID |
| Hologres渠道 | 展示或下钻 | 分母为观测用户，各行为不是顺序漏斗 |
| Hologres分群 | 展示或下钻 | 注册账号及所选用户池；事实/事件截至时间分别说明 |
| Hologres推荐 | 展示或下钻 | 绑定后使用；严格账号关系，不等于首次激活 |
| 活动监控 | 共享 ANALYSIS_SQL | 固定名单、固定分母、活动观察窗口 |

时间范围原则以[start,end)为准；日去重、周期去重、会话数量、订单数量应明确单位，日人数不能相加当周期人数。推荐的“绑定后使用”、活动的“首次观测完成”和北极星“当日分析”是不同业务条件，不能强制同值。

## 修复与验收顺序

1. 固化已确认定义，统一完成/曝光/空结果状态、缓存和后台计算边界；以完成事件作为正式业务证据，曝光另外记录。
2. 修复筹码展示DOM时序；为下钻完成补发起时冻结的visit/entry/request上下文，保证同次Token漏斗可关联。
3. 补页面/模块、搜索和钱包链路；核查产品全部分析入口，包括浮窗、手机、直达、缓存、全生命周期、内盘、圈选。AI worker 内部分析单独标 actor，不能自动算用户完成。
4. 清除 SQLite 单事件计算与字典漂移，统一指标显示名称、首次观测文案和用户池说明。
5. 生产验收一条动作一个可追踪event_id：发起→失败/成功/空结果→缓存→换Token→切后台→30分钟返回→匿名登录合并→重试。按采集请求、collect接收、Hologres、报表和下钻名单逐层核对。

必须增加一个口径金样：A仅展示、B仅下钻、C两者、D失败、E仅AI后台计算、F跨日、G匿名后登录。相同范围、来源、身份集合和快照下，北极星、渠道分析人数、分群分析人数对齐；同次业务漏斗另验证Token访问ID。首次分析用完整历史事实或明确标首次观测；D1/D7使用成熟观察窗口且显示覆盖不足。

本次完成的是审计，尚未执行上述修复和生产操作验收。与较早审计冲突的页面埋点状态已明确列出，不沿用旧“已补接”结论。
