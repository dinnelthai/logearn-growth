# LogEarn 当前数据接入契约

更新：2026-10-06。此文件描述当前代码接受的格式；后续实施顺序见根目录 [todo.markdown](../../todo.markdown)。请求客户端存在不代表真实后端已上线。本仓库没有产品网站、采集服务或业务后端。

## 1. 当前读取 API

默认前缀 `/api/analytics`，配置 VITE_ANALYTICS_DATA_SOURCE=api 和 VITE_ANALYTICS_API_BASE_URL。默认 JSON 模式不请求业务 API。

| 路由 | 响应根键 | 必需性与状态 |
|---|---|---|
| GET /logearn_events?start=MS&end=MS | logearn_events，meta | 必需；参数为毫秒，当前启动查询近90天 |
| GET /users | users | 必需；无行为用户也纳入元数据用户池 |
| GET /logearn_user | logearn_users | 可选补充用户事实 |
| GET /logearn_user_referral | logearn_user_referrals | 可选；正式推荐关系读取 invitees_l1 |
| GET /trades?start=ISO&end=ISO | trades | 可选；ISO 参数 |
| GET /channels | rules | 渠道管理客户端已有；不替代事件接口 |
| PUT /channels | 成功 JSON | 输入 channel、expected_version；服务端需提供版本校验与持久化 |

旧 /events、/referrals 扁平响应不是当前查询客户端契约。空数组表示成功且无记录，缺失或请求失败不能当作零；必需接口失败显示加载错误，不回退 Mock。暂不支持 cursor 追读，必须提供完整查询数组，不能静默分页截断。

## 2. 事件响应

```json
{
  "meta": {
    "history_complete": false,
    "events_complete_through": "2026-10-06T06:00:00.000Z"
  },
  "logearn_events": [{
    "event_id": "evt-1",
    "event_name": "first_visit_captured",
    "occurred_at": "2026-10-01T02:00:00.000Z",
    "user_id": null,
    "anonymous_id": "anon-1",
    "session_id": "session-1",
    "properties": {
      "first_referrer_url": "https://x.com/post/1",
      "first_landing_url": "https://app.example.com/analysis",
      "first_visit_at": "2026-10-01T02:00:00.000Z"
    }
  }]
}
```

- event_id 稳定唯一，重试复用。user_id / anonymous_id 至少一个；登录关联事件携带两者。
- occurred_at 为带时区 ISO；也接受 client_ts 毫秒且优先。无效及晚于 asOf 的事件不进入指标。客户端时间不能作为后端确认成交的权威时间。
- session_id 用于路径；缺失时按30分钟无操作推断。同匿名 ID 多账号冲突已隔离，具体政策见第12节；真实跨设备身份确认仍由后端提供。
- properties 保存 Token/入口/策略/交易/分享上下文。当前可消费事件名单以 src/analytics/eventConfig.js 为准；未知事件忽略。
- history_complete=true 是后端对所需历史完整性的声明，不能因数组非空就置 true。API/JSON 模式将 asOf 限制到当前时间/JSON as_of 与各有效来源完整水位的最小值，事件和交易共享该观测截止。缺少声明不推断完整，仍展示已观测事实和覆盖未确认提示。
- 时间范围 `[start,end)`，业务日 Asia/Bangkok（UTC+7）。同毫秒漏斗步骤当前不能表示严格先后。

## 3. 用户事实

```json
{"users":[{
  "user_id":"u-1",
  "created_at":"2026-09-01T00:00:00.000Z",
  "first_source":"未知渠道",
  "first_analysis_at":"2026-09-02T01:00:00.000Z",
  "first_analysis_entry_module":"signals",
  "preferred_language":"zh-CN",
  "telegram_bound":true,
  "email_bound":false
}]}
```

/logearn_user 使用 logearn_users 根键提供补充数据，当前 normalize 读取这些历史与属性事实。first_analysis_at 参与首次/回访分类、分析入组及留存，不生成新的活动事件。语言归为 zh/en/未知；绑定未知不能猜测。不要增加 notification_preferences，当前生命周期不发送。

来源统一首次获客口径：first_visit_captured 最早记录及已有渠道快照优先；无快照用 referrer 精确域名规则。旧事件 first_entry_source 原值保留 behavior_entry_source，有渠道事实时内部 entry_source 统一用户来源。站内 entry_module 与外部来源分离。北极星只有时间维度，不按来源过滤。

## 4. 推荐关系

```json
{"logearn_user_referrals":[{
  "user_id":"inviter-1",
  "invitees_l1":[{
    "user_id":"invitee-1",
    "bound_at":"2026-10-01T00:00:00.000Z",
    "referral_link_id":"link-1",
    "share_type":"signal"
  }],
  "invitees_l2":[],
  "invitees_l3":[],
  "commissions":[]
}]}
```

绑定由后端业务库确认；当前增长分析展平一级关系，不将二三级算成直接邀请。referral_link_id/share_type 缺失保留 null，不能根据相邻访问猜测正式关系。排除自邀，按被邀请者首次绑定去重；绑定后7天内有效分析为激活，未满窗口且未激活为待观察。K=激活被邀请人/至少有绑定的推荐者。分享者、接收者、绑定用户不是一个用户顺序漏斗。

## 5. 交易事实和关联

```json
{"trades":[{
  "trade_id":"trade-1",
  "trade_attempt_id":"attempt-1",
  "user_id":"u-1",
  "confirmed_at":"2026-10-01T03:00:00.000Z",
  "volume_usd":125.5,
  "status":"confirmed",
  "chain":"solana"
}]}
```

trade_id 必须全局稳定唯一，用户 ID 与事件一致。成交额为非负 JSON number，USD 成交额而非手续费；后端必须提供全平台成交。当前按 trade_id 去重，并按 trade_id / attempt ID 对齐原始成功事件与事实；confirmed 的有效时间不得超过 asOf。已统一排除缺交易/用户 ID、无效时间、非法金额、非 confirmed 和未来事实。相同内容去重；同 ID 的用户/金额/时间/关联/链等内容冲突则整组隔离，不任取最后一条。tradeQuality 记录整个载入快照的互斥排除原因，与当前日期提交监控范围不同。

交易事件 trade_submitted/trade_succeeded/trade_failed 必须携带 trade_attempt_id 或 trade_id；同一次提交与结果共用关联字段，结果最好同时携带两者。监控按统计期内提交入组，允许结果晚于统计期但不晚于 asOf。缺关联 ID 时成功率显示未确定，不按同周期原始结果数除以提交数。交易贡献按期末已完成有效分析的固定用户组计算，包含分析前交易，是描述性构成而非分析导致的交易。

分析到单笔成交的 value loop 仍需后端业务关联；没有关联数据时隐藏，不按时间邻近推算。

## 6. 渠道配置、事实和可选扩展

渠道规则包括 id、name、conditions、priority、enabled、version、updated_at。conditions 支持 referrer_domain 和六个第二版链接字段（utm_source/medium/campaign/content、partner_id、placement_id），精确匹配、AND，优先级数值越小越先，同值按 ID。unknown 为固定系统兜底，不能停用或编辑。

PUT /channels 输入 `{channel:{...},expected_version}`，新增 expected_version=0；客户端当前提交新版本，服务端检查版本和权限，冲突409，成功返回 JSON。JSON 模式 channels.json 为唯一配置来源，编辑禁用。

first_visit_captured 可提供 channel_id/channel_version 快照；当前归一化不重新分类已有快照。无快照记录可以按当前配置匹配 referrer，生产环境应由后端冻结原始访问及规则版本，避免配置改变后历史重新匹配。

当前渠道报表使用访问、用户、事件、交易事实在浏览器计算，不要求 /channel-stats。服务端聚合 /channel-stats、分页 /channel-users、邀请链接签发/验证均为未来扩展，尚无对应端到端服务；数字和名单必须同口径。具体 KOL/群/账号/币安广场不能仅凭域名识别，见 todo.mkdown。

## 7. 生命周期和数据文件

生命周期仅分析六类候选与增长动作；Dashboard 自行计算。没有 GET /lifecycle、PUT /lifecycle/rules、POST /lifecycle/dispatch 的交付要求，不需要后端分群、订阅和发送记录。旧适配器文件不代表页面调用。

当前静态入口：src/api/logearn_user.json、logearn_events.json、logearn_user_referral.json、trades.json，src/channels/channels.json 和 src/lifecycle/lifecycle-rules.json。logearn_events.json.meta 提供 start_at、as_of、timezone、history_complete、events_complete_through。旧 mock-api 文件及生成器不是运行时数据源。字段说明保留在各实际 JSON 顶部 scheme。

## 8. 计算与人群边界

漏斗默认用户严格顺序与时间窗匹配；新增同 token_visit_id / strategy_run_id 关联模式，详见第11节；路径保留 A→B→A→C、只合并连续相同节点、排除心跳。留存按首次行为自然日批次计算，D1–D7 和连续模式分开，未成熟不当成流失。

抽屉固定搜索匹配的全部用户 ID 和原统计期，可连续查看漏斗、路径、留存，在人群内继续筛选。北极星、推荐、交易监控仍为平台口径。快照仅在当前页面会话内，刷新清除；人群激活时全局配置保存/恢复禁用。分群对比是描述性相关分析，不能据此认定因果提升。

## 9. 交易质量 Mock 验证（2026-10-06）

现有 JSON 增加 MOCK-TRADE-01、mock_demo 演示链：4笔去重提交，2成功（其中1笔跨统计期确认）、1失败、1待确认；演示链成功率50%。重复成功事件与事实只计一次。交易事实共有477条，接受472条，排除5条（缺ID/无效时间/负成交额/未来/重复各1条）。有效演示成交全快照200 USD，最近完整业务日期间125 USD；跨期结果计入提交监控，成交额仍按确认时间所在周期计算。原有缺关联提交保留，整体成功率仍未确定；不猜填关系。

## 10. 覆盖范围与统一观测截止（2026-10-06）

事件响应 meta 提供 events_start_at（兼容 start_at）和 events_complete_through；交易响应 /trades 的 meta 提供 trades_start_at（兼容 start_at）和 trades_complete_through。日期均为带时区 ISO，范围 [start,end)。只有有效、顺序正确且 complete 不为 false 的双边界才声明完整；请求起点进一步裁切范围。history_complete 是历史首次/状态判断声明，与查询范围内完整性不同。

```json
{"meta":{"trades_start_at":"2026-09-28T17:00:00.000Z","trades_complete_through":"2026-10-06T06:00:00.000Z"},"trades":[]}
```

以上空数组在覆盖范围内代表完整零成交；没有 meta 的空数组只是已加载记录为空，覆盖未确认。当前 Mock trades.json 完整从09/29业务日开始，不能据此补造此前的零交易。

- 显示状态：覆盖完整、仅部分覆盖、未覆盖、覆盖未确认。数字仍可描述已观测事实，不能把部分金额称为完整平台总量。
- 同期变化仅在本期/上期均完整时计算，事件和交易分别判断；完整上期为0不计算百分比增长，不能称作缺数据。
- 未覆盖完整日的交易图为空点，明细为未覆盖；行为日图也不为缺失日填0。
- 留存要求D0及回访日期覆盖；连续模式要求从D1起所有日期，未完成日只能作为进行中观察。7日最终值需要全窗口覆盖且自然日已结束。渠道与人群对比的成熟留存同样检查覆盖。
- 生命周期在历史未确认或近28天覆盖不足时显示已观测候选警告，不恢复实际发送。
- 7日均线使用已有完整业务日，历史起点不满7日按可用完整日数计算；任何所需范围未确认不画均线，不以0补齐。

## 11. 漏斗业务关联（2026-10-06）

| association | 匹配规则 | 建议预设 |
|---|---|---|
| user（默认） | 用户事件严格先后，不限制币种或运行 | 登录→详情→分析 / 原AI激活 |
| token_visit | 同一用户、同一 token_visit_id；双方币种/链都有值时也必须一致 | Token点击→详情→分析 |
| strategy_run | 同一用户、同一 strategy_run_id | 策略启动→结果生成→结果查看 |

每位用户只用周期内首次符合策略条件的起点，最多入组一次；这是用户去重的同次业务转化，不是统计所有访问或运行次数。起点缺关联ID排除并列缺失名单，不另取后来有ID的起点。后续候选事件缺ID导致无法关联时列 dataIncomplete，不确认流失；不会退回用户顺序模式。表格比例是已观测到达比例，不代表缺失已补齐。

后续步骤时间必须严格大于上一时间，且不超过起点窗口与 asOf；允许跨统计期结果，同毫秒不能推断顺序。业务事件的顶层/ properties token_visit_id 被保留；strategy_run_id 使用 properties。既有 signal_viewed 同时校验 result_id，但此漏斗按运行ID关联，不是单一 result_id 的转化。

主漏斗与分群漏斗对比使用同一 computeFunnel；配置保存新增 association，旧配置默认为 user。Mock在现有JSON增加4位 MOCK-FUNNEL 用户，覆盖匹配成功、跨访问/运行、起点缺ID与后续缺ID；scheme同步，无运行时生成。

页面工程更新（2026-10-06）：北极星/漏斗/推荐/分群已拆为 pages 页面工厂，查询 API、JSON 与统计契约不变；图表资源统一清理。接续见 todo.markdown P1-04。

## 12. 输入质量和身份冲突（2026-10-06）

先执行输入校验，再建立身份映射。无效时间、未来事件、未知类型、非法身份/上下文不参与映射和指标；client_ts 必须有限 number，不接收数字字符串。缺 event_id 的合法历史事件仍保留，但单列无法可靠去重提示。相同ID/相同内容重复去重，内容冲突整组隔离；对象字段顺序不造成假冲突，合法记录不会被先到的无效同ID记录遮挡。

一个 anonymous_id 在截至观测时间的合法事件中关联唯一用户时合并；关联多个用户时不任选第一条。纯匿名事件保持 anonymous:…，显式用户事件保留 user:…。inputQuality.identity 包含 mergedAnonymousIds、conflictedAnonymousIds、unmergedAnonymousEvents 及 conflicts（anonymous_id/user_ids）。这些未合并身份可能影响去重人数与链路解释，不能宣称为唯一自然人；后端仍需权威身份确认。

用户/补充用户数据先分别校验 user_id 和日期/属性类型，不能创建 user:undefined。非法或未来日期、非布尔绑定、非字符串来源/语言置未知并记录invalidFields。同一来源用户记录冲突整组隔离；补充 logearn_user 仍按原协议作为绑定等属性的权威补充。事件可选关联/来源字段非法类型置未知；有限数值chain转字符串，首次访问时间兼容有限毫秒/ISO并标准化ISO。

推荐先统一过滤非法ID、自邀、无效/未来绑定；每个invitee保留最早绑定，相同内容重复去重，晚于首次的事实计superseded。同一最早时间内容矛盾则该invitee整组隔离，不任取邀请人/链接。正式关系、推荐和分享计算消费同一校验结果；缺推荐接口仍为null，不变成空数组。

inputQuality 顶层含 events、users、logearnUsers、referrals、identity；原有 tradeQuality 保留。各来源input=accepted+excluded，排除原因互斥；invalidFields和missingEventId属于独立诊断，不与排除总量相加。范围非法明确失败，可选接口根数组格式不符保留缺失状态。

## 远程注册用户分群（2026-10-11）

Hologres模式的 `POST /api/metrics/segments` 使用注册账号作为分母，事件身份未匹配账号者单列。沿用202作业轮询和账户隔离的cached_list下钻。

请求：`{start,end,source,audience_ids,cohort_id,filters,group_by}`。start/end为毫秒半开区间，最长366天；前端提供含今日的7/14/28天统计期。缺省日期使用最近7天。filters是交叉条件：registration/login（all/7/28/older，login另含unknown）、binding（all/telegram/email/both/neither）、identity（all/phantom/metamask/multiple）、invitation（all/referred/none/inviter）、trade（all/none/first/repeat）、status（all/active/locked）、segment（all及当前显示行为分类）。trade的first仅指一条历史交易记录，不声称已确认首次成交。group_by支持binding/registration/identity/invitation/trade/status/segment。

响应新增summary、registered_total、unmatched_users、comparison、registration_cohorts、start/end、facts_as_of、retention_reason；每行提供list_key。summary分析覆盖率/策略率/交易记录用户占比均以筛选后注册用户为分母；平均分析活跃日以分析用户为分母。期间登录人数依据事件明确user_id，不从当前last_login_at重建历史登录频次。各注册周批次描述同一统计期内表现，不能解释为同账号年龄的转化。

当前事件完整覆盖及历史首次未确认，D1/D7、注册后7日分析率返回null；观察不足不能显示为0或确认流失。行为分类“未观测分析”不证明历史从未使用。当前绑定属性用于描述相关性，不代表注册时或分析时状态。

分群cached_list分页返回账号创建/最近登录、最近分析、28天分析天数、当前绑定、身份类别、账号状态、邀请标签和历史交易记录数。细节由同一分析作业缓存，事实表后续改变不会重新生成明细字段；名单存在性和来源查询仍可能受源历史更新影响，整体保持arrival-cutoff弱一致。缓存过期要求重新分析。

### 业务信号默认用户池（2026-10-11）

segments请求增加 `pool`：business（默认）、registered、contact_only、no_signal；group_by新增signal并作为默认。邮箱/TG单独不是业务信号。business纳入已观测有效分析/实际策略使用、历史交易记录、NFT持有记录、近期正余额或可用积分任一条件的注册账号。contact_only为没有业务信号但有已验证邮箱/TG者；no_signal为没有已知业务信号且没有已验证邮箱/TG者。未知事实不证明用户无价值，三池只是已知证据划分，不称为死用户。

filters新增asset：all/balance/nft/points/vip/balance_unknown/points_unknown。VIP正式权益未确认，vip_active始终null，不从交易等级猜测；页面不开放有效VIP筛选。响应增加focus、business_total、contact_only_total、no_signal_total、pool，以及value/recent_used/contactable_value/value_without_recent_use名单。近28天使用指有效分析或实际策略启动；近期未观测不等于流失。分析覆盖等率使用当前选择并筛选后的用户池作为分母，全注册总数置于背景入口。

NFT只读取Ethereum/Base的nft_owner所有权记录，以chain+nft_num去重，经已验证钱包身份及active wallet_v2的地址关联；EVM地址规范化大小写，跨账号地址冲突排除，不按数值钱包ID猜关联。新版wallet_balance_v2当前为空；旧user_balance通过同一唯一身份地址关联，仅采用明确EVM链1/56/42161、24小时内更新的记录。正余额只作线索，不做USD估值、不能声称完成残值过滤，缺记录/过期为未知。可用积分来自user_points_account.available_points，缺记录或重复用户行不强取最大值，保持未知；当前表为空。

分群下钻新增signal_tier、business_signal、nft_count、has_balance、balance_updated_at、available_points、vip_active。不传钱包私钥、身份credential或联系方式。事实仍为弱一致查询。

### 手动刷新（2026-10-11，覆盖早期自动刷新说明）

远程分析不再定时检查meta，也不在页面重新可见时触发请求。首次加载后仅用户点击顶部“刷新数据”按钮获取新版本。`POST /api/analytics/refresh`（需认证）绕过30秒status缓存并返回新meta/snapshot；旧快照在正常TTL内继续供下钻使用。该接口只读源数据，无远程写入。

按钮刷新期间禁用，等待当前页面分析完成后恢复；同一时刻仅一次手动刷新。失败保留旧结果并允许重试。保留已应用筛选和分群用户池；有未应用编辑时只更新可用数据版本，保留旧分析与编辑，提示应用修改。长分析的202作业轮询仍用于完成用户主动发起的请求，不是后台自动刷新。

### 分群图表与精确下钻（2026-10-11）

行为分群环图使用互斥分群；资产标签可重叠，使用独立条形占比。人群效果对比展示各组分析、策略和交易记录用户占比；注册批次图展示最近12个注册周在同一统计期内的分析覆盖，完整批次表可展开。

cached_list新增 `period:analysis/strategy/trade/login/new`、`nft/balance/points`、`referral:new/analysis`；比较组和注册批次的既有list_key增加 `:analysis/:unobserved/:strategy/:trade` 后缀。点击柱形返回该指标分子用户，点击人群总数返回整组；所有名单与汇总来自同一作业。未知积分/VIP不当作零，零分母比例显示不可计算。

常用5项条件保持展开，其余折叠；统计期统一在主筛选区。图表随容器和主题变化重绘，切页或重新分析销毁旧实例；按钮、图例及展开表提供图形下钻的替代入口。保留顶部手动刷新。

## 分析任务与跨模块人群（2026-10-11）

增加“分析任务”入口：业务用户未使用诊断、渠道质量、积分签到效果、推荐增长质量四个模板。新任务默认含今日7天，锁定已有远程snapshot_id；诊断模板采用filters.task=value_unobserved，积分模板采用filters.points=recent。任务栏支持模块导航、人工标记已核对、记录结论与下一步；任务记录保存在本浏览器，不保存用户ID，不能自动恢复旧名单或假装旧快照仍有效。

认证 `POST /api/analytics/audience` 请求 `{cache_id,list_key,q}`，从当前账号拥有的作业缓存取得完整搜索匹配名单，包含全部分页；返回去重ids、原start/end/source、snapshot_id/as_of及origin。只接受用户/匿名用户名单，记录/关系名单拒绝；空人群、超过50000人、缓存/快照失效明确报错，不截断或退回全平台。客户端可继续进入分群、路径、漏斗、留存、渠道、推荐和交易监控。固定人群路径查询允许最长31天，保留原150000条/48MB预算；全平台路径查询仍最长7天。

各远程POST分析增加可选snapshot_id，给定时必须使用该快照且保持既有预算、认证作业和所有者隔离。任务或人群锁定时分群和推荐不重新计算统计期；任务刷新只更新可用数据版本，不自动替换任务快照或名单。北极星仍为平台基准并显式提示。各模块统计条件不同，不把同一用户范围等同于同一行为分母。

用户抽屉支持保存完整匹配名单为用户群组，cohortClient发送已有Bearer认证；远程群组可直接在分群侧栏用于分析，不依赖浏览器加载全量用户。快照来源名单仅保存用户ID，群组再次分析采用新的数据事实，应另开新任务。推荐的全平台累计传播背景仍保持全体账号范围，选中用户范围只约束被邀请用户批次。

## 分群积分与签到（2026-10-11）

`POST /api/metrics/segments` 增加 `filters.points`：all/ledger/recent/earned/negative/checkin/streak，分别对应任意已观测积分流水、本期变动、本期正变动、本期负变动、本期签到、本期最长连续签到至少3天。积分流水或签到纳入business池；可用余额字段和asset=points仍只依据余额表，缺记录为未知。

新增 `points.summary/types/days/quality/definition`。正变动与负变动分别聚合，负变动不称消费；签到按UTC+7日去重，最长连续天数仅在所选期间内计算，不使用旧表缓存的连续天数字段。来源参与者可重叠，签到表的奖励不再叠加到积分流水。每日与来源及summary名单使用 `points:*` list_key，仍采用账号隔离的同作业缓存。

下钻用户新增points_records/points_period_records/points_earned_period/points_negative_period/last_points_at/checkin_days_period/checkin_streak_period/last_checkin_at。内部画像缓存采用字段字典+数组压缩，API仍返回命名字段，保留零、false与null语义；未提高4MB作业结果预算。

业务表旧user_id若存在旧user_account，必须通过唯一已验证钱包身份映射account_v2，不按数字相等猜测。旧表不存在时可采用存在的新account_id；地址冲突/未匹配单列quality。quality是全库来源用户诊断，不受页面用户池、来源或条件筛选影响。仅使用截止前流水/签到事实，数据库只读，历史覆盖和余额完整性不确认。

## 真实渠道分析（2026-10-11）

认证 `POST /api/metrics/channels`：`{start,end,source:'all'|真实来源值,pool:'active'|'new'}`，最长31天，沿用202作业、账号隔离和15分钟名单缓存。真实来源使用 `first_entry_source` 最早非空记录；空来源单列，不套用本地演示渠道规则，也不推断SEO或付费属性。匿名身份仅在无歧义时合并。

响应 `total/groups/days` 包含用户、首次观测、存量观测、已登录访问、Token详情、分析、策略、提交和成功终态用户；各行为独立覆盖，比例分母是同组用户。日用户去重，不能相加为周期用户；每日首次观测按当日首次事件计算。`groups[].list_key` 和每个指标后缀返回同一作业的准确名单，支持分页、搜索和同快照时间线。

活跃池为本期发生任意事件的用户；首次观测池为首次已观测事件在本期的用户，不等于已确认新增获客。`d7_rate/payment_users/volume_usd` 保持null，历史完整性和交易币种金额未确认。成功终态用户是上报成功事件的用户，订单终态成功率应使用交易监控页。

页面提供来源贡献图、每日趋势、来源质量表、每日明细及图形/人数下钻。只手动刷新；刷新失败仅在同配置下保留旧结果，切页销毁图表并拒绝迟到请求。

## 远程推荐与增长循环（2026-10-11）

认证 POST `/api/metrics/referral`，请求 `{start,end,scope:'all'|'period',quality:'all'|'business'|'value'|'used'|'contactable',inviter,window_days:7|28,source}`；scope=all忽略绑定批次范围，仍要求有效的范围参数。沿用202作业、所有者隔离和15分钟快照缓存，不加载全量事件。

响应包含 summary、global、window、ranking、daily、cohorts、quality 和 drill。summary描述所选绑定批次；绑定后行为观察至各自截止。global始终是全体账号累计关系，不受推荐人/来源/质量/批次筛选影响；window的分母保留所选批次未推荐者，pending单列，confirmed_new_registration_rate=null。二三级佣金与金额未在第一阶段接入。

一级推荐双方必须匹配account_id、有效非自邀、排除ID=0/缺推荐人/未匹配身份/时间异常/同时间冲突/循环关系。下一代要求中间用户绑定时间严格早于下代，使用微秒精度保持数据库顺序；相同时间单列global.simultaneous，不计传播。注册邻近绑定只作描述，不确认新增获客或无成本自然增长。

推荐下钻的成员和画像来自同一作业缓存，支持分页与按用户/来源/关系原因搜索，不重新查询当前关系生成名单；未知身份以relation记录单列，不能点击为账号时间线。榜单总数、使用、交易、价值及下一代分子分别对应list_key；profile/children名单支持推荐人详情和逐层展开。缓存所有者、过期校验与其他下钻一致。

前端默认累计榜单，提供7/28/90天绑定批次、7/28天传播观察窗、质量与推荐人筛选、贡献排序/搜索/分页、3张图表、累计传播卡片、异常分类下钻。只手动刷新；未应用筛选保持编辑，失败仅在同一筛选口径下保留旧结果，切页拒绝迟到响应。

### 2026-10-11：远程行为路径与手动交易终态监控

- `POST /api/metrics/paths`：含今日最长7天，`path_start` 为实际已知业务行为或 `all`，`path_depth` 为3/5/7；可传首次来源与已有受众。真实用户+会话取得全部已观测上下文；缺session按30分钟推断。返回会话数、去重用户、平均步数、路径种类、前100种路径、结束状态及前12种路径的桑基图覆盖率。
- 路径图是显式标注的子集；`graph.nodes/links[].list_key` 只下钻图中路径的用户。完整路径/结束状态名单与图中会话数采用不同去重单位。历史覆盖未知，窗口截止、仍在观察、观测结束及折叠分别统计。
- `POST /api/metrics/trade-monitor`：最长31天，`chain`/首次来源筛选；按提交日期组成批次，结果观察至快照截止。提交按用户+尝试ID去重；终态订单按用户+链+订单ID去重。明确关联，不按时间猜测；重复、矛盾、别名冲突、未关联终态单列。
- `success_rate = succeeded / (succeeded + failed)`，仅已关联且无冲突终态订单进入分母，无终态为null。提交、待确认、混合及钱包数未知是批次；成功/失败是订单，两种单位不可相加。钱包数未知只确认已观测订单，不确认整批完成。
- `total`/`days`/`chains`/`reasons` 的 `list_key` 与 `list_entities` 决定下钻集合及单位。提交成员提供 `orders_key`，继续展开该批次的已观测订单。搜索支持用户、尝试ID、订单ID、链、原因；用户时间线传同一个 `cache_id`，最多200条，按时间升序。
- 成功/失败源自产品手动交易业务终态4与3/6/7，不表示链上最终结算。自动策略交易、统一成交额/币种与USD、全历史完整率未提供，页面不估算这些指标。
- 两个接口沿用认证作业、账号隔离、15分钟缓存和预算限制；远程数据库只读。所有刷新需按钮点击，编辑待应用时保留原结果；同口径刷新失败保留旧结果，切页销毁图表并忽略迟到响应。

### Credits用户额度
分群新增 `filters.credits=all|available|used|empty|unknown`。`credits:available/used/empty/unknown` 为完整注册用户下钻名单，可用于任务跨模块圈选。`payload.credits` 返回各类人数和全库身份质量；用户明细包含 `credits_available/credits_used/credits_total/credits_cumulative/credits_updated_at`。
数据来自 `api_quota`，按快照截止时间限制创建与更新时间，经唯一已验证钱包身份关联注册账号；多个来源ID关联同账号时保守隔离，不叠加额度。无记录为未知，明确0与未知分开。可用额度直接采用 `available_quota`，不按总额减已用推算；累计已用不当期间消费，额度不证明付费。可用Credits计入价值线索，有已用Credits计入使用信号，但不推断近期使用。AI credits流水表当前为空。该表非版本化，后续更新可能影响同一截止时间的重查结果，已缓存下钻仍匹配其汇总。
