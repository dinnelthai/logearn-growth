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
