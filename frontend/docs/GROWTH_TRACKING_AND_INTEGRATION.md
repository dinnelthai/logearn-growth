# LogEarn 分析框架：打点与实施交付

更新：2026-10-06。本文只描述当前实现和明确标注的待接工作；接口完整格式见 [API_DATA_CONTRACT.md](API_DATA_CONTRACT.md)，实施优先级及接续记录见 [todo.markdown](../../todo.markdown)。旧迭代描述已清理，不能把 SDK 或查询客户端存在当成真实业务上线。

## 1. 分析框架与当前边界

| 功能 | 当前实现 | 依赖与限制 |
|---|---|---|
| 北极星 | 全周期/7/14/30天；周期去重分析用户、首次/回访、每日分析和登录、同周期对比、交易贡献 | 只有时间维度；登录是明确 login_succeeded，不代表所有保持登录状态用户 |
| 渠道 | 首次访问归因、效果表、趋势/漏斗、获客名单、规则配置 | 优先历史快照；无快照按 referrer 精确域名；具体账号/社群需第二版 |
| 漏斗 | 预设/自定义、转化窗口、逐步转化、未转化/待观察及名单 | 默认用户顺序；可切同 token_visit_id 或 strategy_run_id 模式 |
| 路径 | 四个模块、详情/分析/策略等节点；返回路径与会话、Sankey | A-B-A-C 保留；连续重复合并；缺 session 时推断；心跳排除 |
| 留存 | D1–D7、连续留存、批次曲线/表格及名单 | 同一 D0 分母；自然日；未成熟不是零；历史缺失需提示 |
| 推荐 | 分享操作、链接访问、正式绑定、激活、链接排行、K | 绑定来自业务事实；点击不等于分享完成；不同 actor 不串为单用户漏斗 |
| 分群 | 行为状态、语言、绑定、推荐/交易属性及比较视图 | 中文/英文是用户维度；未知单列；属性比较不证明因果 |
| 生命周期 | 六类候选与建议增长动作 | Dashboard 自算；仅分析，无发送服务要求 |
| 跨页人群 | 固定搜索名单和原统计期，漏斗/路径/留存连续分析 | 刷新清除；北极星/推荐/交易监控保持全平台口径 |
| 交易监控 | 按提交批次匹配成功/失败/待确认、关联缺失提示 | ID 关联，不使用同周期结果/提交数猜测成功率 |

页面所有业务数值来自已加载 JSON/API 事实。未提供模块隐藏或显示缺失，不补造数据。价值闭环缺少分析→交易关联时隐藏。激活与价值时刻暂不在实施范围。

## 2. 分工

| 执行方 | 交付内容 |
|---|---|
| 产品前端【外部仓库】 | 在真实页面触发成功事件，调用 SDK、接入 transport 和失败队列；配置本站域名；登录带双身份 |
| 本仓库 SDK | 事件校验、会话管理、首次入口捕获与稳定重试 payload；不是采集服务器 |
| 业务/数据后端【外部依赖】 | 采集幂等、身份合并、历史首次事实、交易确认、推荐绑定、权限、覆盖水位 |
| Dashboard | 归一化、指标计算、缺失显示、下钻与人群协调 |
| QA | 用真实完整链路核对原始事实和页面，不只检查图表有数字 |

## 3. 必须由产品前端打点的事件

公共字段：event_id、event_name、occurred_at、user_id/anonymous_id、session_id、properties。event_id 重试稳定；时间 UTC ISO；范围 [start,end)，业务日 UTC+7。

| 优先级 | 事件 | 触发条件 | 业务字段及责任 |
|---|---|---|---|
| P0 | first_visit_captured | 首次文档外部入口或首次空来源入口 | first_referrer_url、first_landing_url、first_visit_at；调用 captureFirstVisit，不在每次路由更新时调用 |
| P0 | app_opened_unauthenticated | 未登录状态打开产品 | page；产品页面 |
| P0 | page_viewed | 页面真实呈现/SPA路由有效变化 | path、路由名；产品页面，不把每次重渲染当新访问 |
| P0 | login_button_clicked | 用户点击登录 | source；产品前端 |
| P0 | wallet_connect_submitted/succeeded/failed | 钱包连接发起、确认或失败 | 钱包类型/失败原因；必须根据实际结果 |
| P0 | login_succeeded | 明确登录成功 | user_id 和 anonymous_id；autoLogin 当前不报，避免重复登录计数 |
| P0 | module_viewed | 喊单/信号榜单/热门/FOMO内容呈现 | module=callouts/signals/popular/fomo；非轮询 |
| P0 | ranking_token_clicked | 点击榜单 Token | entry_module、token_address、chain、token_visit_id；item_id/position 建议提供 |
| P0 | token_detail_viewed | 详情成功呈现 | 同次 token_visit_id、token_address、chain、entry_module |
| P0 | chip_analysis_viewed | 筹码峰实际成功展示 | 同次 Token 上下文；后台预加载/轮询不计；成功缓存展示可计 |
| P0 | trade_submitted | 用户实际发起交易 | trade_attempt_id 或 trade_id；chain/Token；结果与提交共用关联 ID |
| P0 | trade_succeeded / trade_failed | 交易得到可靠终态 | 同次关联 ID；失败原因；成功优先后端/链上确认，选定唯一事实所有者 |
| P1 | strategy_started | 策略实际从停止/暂停变为启动 | strategy_run_id、strategy_type、Token 上下文；恢复页面不重复计 |
| P1 | signal_viewed | 策略结果真实被查看 | strategy_run_id、result_id；不是后台结果生成 |
| P1 | share_button_clicked | 主动点击分享按钮 | referral_link_id、inviter_user_id、share_type、content_id、entry_module |
| P1 | share_completed | 完成明确的分享操作 | 同分享上下文；复制/分享面板成功不代表对方收到 |
| P1 | invite_link_visited | 接收者打开有效邀请链接 | 同分享上下文；actor 是接收者，inviter 是 properties 字段；归属后端验证 |
| P1 | language_changed | 用户主动切换语言 | lang、from_lang；当前分析分组仍使用用户属性 |

share_type 允许值以 src/analytics/sharing.js 的 SHARE_TYPES 为准。Token/信号别名 token_opened、strategy_signal_viewed 兼容旧数据，字段校验与新名称一致。完整事件白名单以 eventConfig.js 为准；上表是实施所需重点，不代表白名单仅包含这些名称。

strategy_result_generated 是后端事实，携带 strategy_run_id/result_id。telegram_bound、email_bound、preferred_language、正式绑定、成功订单和 confirmed trades 使用后端事实；不能只凭“点击绑定/支付/交易”判成功。不增加 notification_preferences 或真实发送记录。

## 4. 首次入口 SDK 使用

```js
import {createTracker} from './src/tracking/client.js'

const tracker = createTracker({
  send: event => actualIngestionTransport(event),
  ownHosts: ['app.example.com', 'www.example.com'],
  subdomainRoots: [] // 只列明确属于本站的子域根，默认不通配
})

// 文档入口执行一次；SPA 内部路由不重复调用。
await tracker.captureFirstVisit({
  referrer: document.referrer,
  landingUrl: location.href
})

// 真正登录成功时关联身份，随后报告登录成功。
tracker.identify(actualUserId)
await tracker.track('login_succeeded')
```

SDK 不假定采集 URL，产品需传 send。firstVisit 使用 localStorage lifetime 独立状态，anonymous_id 跨会话保持，sessionStorage 保存30分钟会话。支持注入 persistentStorage/storage 做测试。旧 session anonymous_id 在首次迁移时保留。

- 同域或配置的 ownHosts / subdomainRoots referrer 被排除；精确域名/子域边界，不用字符串包含。
- 空、非 HTTP(S) 或无法解析的 referrer 保存 null，首次即未知；后来 X 到访不覆盖。
- landing 必须 HTTP(S)；URL 去掉用户名、密码、所有查询参数和 fragment，保留协议/域名/路径。产品不得把敏感信息放 URL 路径；路径中业务敏感字段需产品另行规范。
- 首次事件先持久化，再 send；失败调用 captureFirstVisit 重试，原 ID、时间、URL、身份保持；同实例并发共用 Promise。
- 成功后的重复调用返回 null。普通 track 不含通用持久化失败队列，产品应自行实现队列和幂等重试。
- 存储不可用时降级当前实例内存，不保证刷新后的去重；清理存储也会重置匿名身份。多个标签同时首次创建不具备原子性，服务端须冻结最早首次事实并做幂等/身份合并，不能以客户端 localStorage 代替服务端约束。
- SDK 没有在本分析后台自动调用；上述域名为示例，需要产品部署域名替换。尚无真实产品或采集服务端联调。

## 5. 当前数据文件与接口

默认入口 main.js → jsonDataset.js → normalize.js，静态 JSON：

| 文件 | 数据 |
|---|---|
| src/api/logearn_user.json | logearn_users；语言、绑定、历史首次分析等 |
| src/api/logearn_events.json | logearn_events；meta 的起止、时区和覆盖声明 |
| src/api/logearn_user_referral.json | logearn_user_referrals，增长分析读取一级正式绑定 |
| src/api/trades.json | 全平台确认成交事实 |
| src/channels/channels.json | 渠道规则，JSON 模式只读 |
| src/lifecycle/lifecycle-rules.json | 生命周期分析配置 |

旧 mock-api 目录、demo.json 和生成器不是当前页面数据入口。字段说明写在实际 JSON 的 scheme，不另造运行时假数据。

后端必需 GET /logearn_events?start=MS&end=MS 和 GET /users；可选 /logearn_user、/logearn_user_referral、/trades?start=ISO&end=ISO。根键、完整样例及字段见 API_DATA_CONTRACT.md。必需接口失败不回退 Mock；可选缺失显式处理。已支持 events_complete_through 截止及 history_complete 提示；已统一事件/交易观测截止和覆盖判断，见 API_DATA_CONTRACT.md 第10节。后端必须真实声明覆盖范围，不能用首笔记录推断。

## 6. 渠道管理与第二版

当前条件包含 referrer_domain 和六个链接字段；精确 AND，按 priority/ID 决定一个渠道。unknown 系统兜底不能修改。X 平台域名 x.com/twitter.com/t.co、t.me 和 binance.com 已有规则；仅 binance.com 不认定币安广场，平台不代表具体账号/KOL/群。

首次访问已有 channel_id/version 时保持快照。没有快照的 JSON/API 访问由 Dashboard 按当前规则解析；生产后端需要冻结首次事实和规则版本，否则改规则可能重分类无快照的历史。规则更改、启停不应覆盖已保存首次归因；历史重算未实施。

API 管理 GET/PUT /channels 客户端已有，服务端仍需实现权限、版本冲突409、原子保存和审计。JSON 模式直接修改 channels.json，页面按钮禁用，不读取 localStorage 替代配置。

/channel-stats 和 /channel-users 属于规模扩大后的可选聚合/分页方案，当前明细足以由浏览器计算。邀请链接签发/验证、UTM规范、账号/KOL/社群素材下钻为第二版，详见 todo.mkdown。未提供付费事实不能把支付人数猜成零。

## 7. 生命周期范围

Dashboard 使用用户/事件及规则配置计算 first_analysis、first_strategy、view_signal、inactive_3d、core、churned 的候选与建议动作。历史 first_analysis_at 用于首次分类，同次策略结果匹配 run/result。历史活动不足时无法可靠证明“从未分析”或完整流失。

没有 GET /lifecycle、PUT /lifecycle/rules、POST /lifecycle/dispatch 交付要求；没有发送按钮、订阅、频控执行、供应商或调度。旧 worker/api 仅是未使用代码，不代表真实触达。不要恢复已经移除的 notification_preferences。

## 8. 验收清单

1. 外部入口→登录→分析：匿名身份串联，来源固定；站内 entry_module 不污染渠道。
2. 首次空 referrer→后来 X：保持未知；站内路由、刷新不覆盖；明确本站子域配置。
3. 首次上报失败→重试：相同 event_id/时间/URL，成功后不重复；存储受限提示实施限制。
4. Token 点击→详情→筹码峰成功：上下文一致；未成功展示不计有效分析；多个入口和 A-B-A-C 路径保留。
5. 同期交易事件+事实：不重复；缺关联 ID 不计算推测成功率；跨日结果仍按提交批次。
6. 推荐绑定：正式 link/share_type 不丢失；缺失未归因；未满7日不算失败。
7. 留存：D0去重、自然日边界、未成熟/进行中、历史首次分析已存在的用户不能再入新分析批次。
8. 缺接口/无数据/完整零值区分；历史、水位与同期比较不足提示。
9. 固定人群→漏斗→路径→留存：相同 ID 和原统计期；北极星维持全平台。
10. 渠道后端版本冲突/权限、原子首次事实及真实产品链路需外部联调，不以 Mock 测试冒充上线。

## 9. 工程定位和验证

事件注册 eventConfig.js/events.js；SDK tracking/client.js/firstVisit.js；读取 api/analytics.js；归一化 analytics/normalize.js。指标计算在 analytics/，渠道/分群比较各有模块。paths、retention、tradeMonitor 已拆到 pages/；chartLifecycle.js 管理销毁/resize/主题，audience.js 管理固定名单和日期。北极星、漏斗、推荐、分群也已拆到 pages/；dashboard.js 负责导航、配置、人群与页面协调。

运行 `npm test`、`npm run build`（frontend/），`git diff --check`（仓库）。界面修改补浏览器检查。构建仍有 ECharts/静态 Mock 体积警告，后续按 P2 测量和按需加载。每项完成更新 todo.markdown，真实联调状态独立记录。

## 10. 交易事实质量更新（2026-10-06）

normalize 通过 tradeFacts.js 校验事实。缺ID/用户、无效时间、非法金额、非确认、未来、重复和冲突排除均可核对；同ID内容冲突整组隔离。交易监控页新增折叠质量表，明确是全量快照，避免与当期提交计数混用。新增示例直接写入现有JSON并在scheme标注，运行时无生成数据。Mock演示链可展示50%关联成功率，旧记录缺ID导致全平台仍显示—。新增3条测试，全量101测试和构建通过，浏览器无控制台错误。

## 11. 数据覆盖实施更新（2026-10-06）

coverage.js 集中解析事件/交易范围、计算共有观测截止、判断周期状态及留存/均线所需窗口。事件 meta 使用 events_start_at/start_at、events_complete_through；交易 meta 使用 trades_start_at/start_at、trades_complete_through。JSON 和 API 适配都保留这些声明；未知、无效、complete=false 不作为完整数据。

北极星同期对比不再以首笔交易判定覆盖。日交易空缺与完整零值分开，部分范围金额标为已观测。页面周期提示共享范围判断，人群对比另提示自己的内部统计周期。留存D0与回访日期覆盖校验、连续模式完整窗口校验已接入；生命周期增加历史/近28天不足提示。保留历史首次分析分类，并修正留存批次日期展示使用真实业务日 co.start。

验证：6条覆盖测试，合计107测试通过；构建通过；浏览器核对北极星7/14天、交易缺失明细、连续留存、人群对比及生命周期，无控制台错误。当前仍不支持服务端 cursor 追读或覆盖区间内断档的多区间声明，后端单区间水位必须保证其中连续完整；实际生产联调属于P0-03外部依赖。

## 12. 同次业务漏斗交付（2026-10-06）

新增关联模式和两个预设：Token点击→详情→分析、策略启动→生成→查看。主漏斗/分群对比均调用同一关联计算；质量名单可下钻，保存配置保留模式，旧配置兼容用户顺序。

产品打点责任：一次Token访问的点击/详情/分析共用 token_visit_id，策略启动/生成/查看共用 strategy_run_id；缺失不由 Dashboard 猜测。result_id 在生成/查看事件继续提供，但运行漏斗可以包含同次运行的不同结果。所有步骤仍严格时间排序，跨期仅在窗口/asOf内；每用户首次起点一次，不是业务尝试次数统计。

6条专项测试覆盖跨币/访问/链、跨运行、缺起点/后续ID、不重入、同毫秒、乱序、跨期截止、实际JSON及配置保存/载入。全量113测试和构建通过；浏览器核对两预设、缺失下钻及分群漏斗，无控制台错误。

## 13. 页面拆分交付（2026-10-06）

新增 pages/northStar.js、funnel.js、referral.js、segments.js，各导出 create…Page(ctx)，返回 draw/dispose。原 paths/retention/tradeMonitor 保持相同接口。模块只在 draw 时取当前用户池，通过上下文回调请求切周期、下钻及原人群统计期，不自行改写协调层状态。

北极星每日用户图与交易贡献图各有独立 chartLifecycle，漏斗也使用相同管理器；切页清理图表、ResizeObserver、主题订阅。分群自己持有和销毁比较模块，协调层仍负责渠道配置/图表的挂载清理。主 dashboard.js 约23KB，保留导航、配置、覆盖、人群和公共抽屉。

统计计算和数据文件本轮不变。验证北极星7/14天、首次/回访、关联漏斗/趋势、推荐排序、分群下钻、367人固定名单跨漏斗→路径→留存、重复渠道→分群→北极星切页均正常；113测试、构建和 diff检查通过。静态导入保持现有打包方式，本轮不是包体优化，构建的大资源警告仍由P2按需加载任务处理。

## 14. 身份与输入质量交付（2026-10-06）

inputQuality.js 提供事件、用户和推荐统一校验，normalize在校验后才映射匿名身份。多账号匿名冲突保留匿名活动与明确用户，不按输入顺序选第一个；无效/未来/未知事件不能建立映射。ID重复冲突隔离，元数据非法字段置未知，推荐最早绑定冲突隔离；交易继续使用tradeFacts.js。

页面增加共享折叠质量面板，异常时状态栏提示。统计覆盖全量载入快照，不能与当前日期的业务UV相加。当前Mock明确排除429条超过asOf的事件，仍有9804条有效事件；651个匿名身份可靠合并，0冲突，北极星人数仍386。原有数值first_visit_at兼容为ISO，不误报为非法。

8条专项测试覆盖无效/未来映射、多账号顺序独立、无效同ID保护、冲突事件隔离、类型/时间/元数据、推荐和覆盖边界。全量121测试、构建与浏览器切页通过。P1清单全部完成；后端权威身份、实际产品采集和接口联调仍属外部依赖，不能把这轮前端校验当成后端已接通。
