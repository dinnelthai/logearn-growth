# LogEarn 当前功能与数据层对接清单

> 2026-10-06：统一评估和当前埋点/接口交付请优先阅读 [GROWTH_TRACKING_AND_INTEGRATION.md](GROWTH_TRACKING_AND_INTEGRATION.md)。本文件保留迭代记录，早期缺口可能已被后续章节修正。

依据当前 `src/api/analytics.js`、`normalize.js` 与 `dashboard.js` 核对。本文区分已被代码读取的契约与待实现建议，不能把建议接口视为已经可用。暂不包含“激活与价值时刻”新功能。

## 1. 功能覆盖

| 当前页面/功能 | 依赖数据 | 真实数据状态 |
|---|---|---|
| 北极星：DAA、首次/回访、每日人数与来源、用户下钻 | events + users，筹码峰成功展示 | 已适配；首次事实依赖载入历史 |
| 北极星：每日平台交易量和分析用户贡献 | trades + 历史有效分析记录 | 已适配逐笔交易；无接口则待获取 |
| 漏斗：预设/自定义、时间窗、策略和来源筛选、下钻 | events + users；交易步骤另需 trades | 已适配；当前按用户依次匹配，未限制同一 Token/会话 |
| 行为路径：四个站内入口、Token点击、详情、AI、筹码峰、返回路径 | events + users；session_id | 已适配；交易事件目前未保留 session_id |
| 留存：首次行为、回访行为、D1–D7、连续留存、批次下钻 | events + 首次历史 | 已适配；观察期不足显示待观察 |
| 用户分群：主要分群、邀请/交易标签、时间线 | events + users；referrals / trades 可选 | 已适配有行为用户；没有行为的用户表记录尚未合并进用户池 |
| 推荐：推荐者、绑定人数、7天有效分析、K | referrals + events + users | 已适配；尚未满7天的未激活人群单列待观察 |
| 渠道：访问、登录、分析、D7、交易、付费及交易量 | 访问/获客事实、订单、交易、渠道聚合 | 目前只支持演示，配置管理已有接口客户端，真实报表待获取 |
| 价值闭环：分析后1h/24h成交、AI贡献 | 逐笔交易 + 分析关联 | 目前只支持演示，配置管理已有接口客户端，真实报表待获取 |
| 保存配置 | 浏览器 localStorage | 不需要 API；跨设备同步未实现 |

目前指标主要在浏览器计算，不需要每张图单独一个 API。量大时再迁移聚合与人群下钻到后端，不能只返回图表数字却丢掉下钻数据。

## 2. 已有四个查询 API：可直接对接格式

默认根路径 `/api/analytics`。响应为 JSON 对象，数组键名必须一致。空数组表示接口成功但无记录；报错应返回非2xx，不要把失败包装成空数组。用户ID在所有接口统一使用原始字符串，不带前端 `user:` 前缀。

### GET /api/analytics/events?start=<ISO>&end=<ISO>

```json
{
  "events": [
    {
      "event_id": "evt-0001",
      "event_name": "module_viewed",
      "occurred_at": "2026-10-04T02:00:00.000Z",
      "user_id": "u-1001",
      "anonymous_id": "anon-1001",
      "session_id": "session-1001",
      "first_entry_source": "SEO",
      "properties": { "module": "signals" }
    },
    {
      "event_id": "evt-0002",
      "event_name": "token_opened",
      "occurred_at": "2026-10-04T02:00:15.000Z",
      "user_id": "u-1001",
      "anonymous_id": "anon-1001",
      "session_id": "session-1001",
      "first_entry_source": "SEO",
      "properties": {
        "entry_module": "signals",
        "token_address": "token-address",
        "chain": "solana",
        "token_visit_id": "visit-1001",
        "item_id": "signal-42",
        "position": 3
      }
    },
    {
      "event_id": "evt-0003",
      "event_name": "chip_analysis_viewed",
      "occurred_at": "2026-10-04T02:01:00.000Z",
      "user_id": "u-1001",
      "anonymous_id": "anon-1001",
      "session_id": "session-1001",
      "first_entry_source": "SEO",
      "properties": {
        "entry_module": "signals",
        "token_address": "token-address",
        "chain": "solana",
        "token_visit_id": "visit-1001"
      }
    }
  ]
}
```

上面的样例仅演示字段，并非完整点击链路；真实数据应包含成功呈现的详情事件。

| 字段 | 类型 | 规则 |
|---|---|---|
| event_id | string | 必须唯一，重试保持同一ID；现有适配器按它去重 |
| event_name | string | 见下表，未知类型当前会被忽略 |
| occurred_at | string | 带时区 ISO8601，建议 UTC；现有代码也接受 client_ts 毫秒并优先使用它，避免两者冲突 |
| user_id / anonymous_id | string / null | 至少一个；登录后的关联事件携带两者，才能拼接匿名行为 |
| session_id | string | 路径强烈需要；缺失则按30分钟无操作推断 |
| first_entry_source | string | 首次该行为的外部来源事实；北极星按首次有效分析事件的来源分组，留存按首次所选行为的来源分组 |
| properties | object | 事件业务上下文，字段见下表 |

| event_name | 触发时机 | properties |
|---|---|---|
| login_succeeded | 登录成功 | 可携带来源；必须带登录用户与匿名身份关联 |
| module_viewed | 模块内容真实呈现 | module：callouts / signals / popular / fomo |
| token_opened | 点击模块内Token | entry_module、token_address、chain、token_visit_id 必须提供；item_id、position 建议提供 |
| token_detail_viewed | Token详情成功呈现 | 同一次跳转的 token_address、chain、token_visit_id、entry_module |
| strategy_started | 策略实际启动成功 | strategy_type 当前筛选支持“1.5段”“日内2段”；另带Token上下文 |
| chip_analysis_viewed | 筹码峰成功显示 | Token上下文；缓存成功展示也可计入，后台预加载/轮询不计 |

模块对应：callouts=喊单，signals=信号榜单，popular=热门，fomo=FOMO热门。站内 entry_module 不能写入外部获客渠道。当前路径按事件类型呈现，虽保留Token等字段，但不是按具体币种分节点。A→B→A→C 保留返回行为；只合并连续相同事件。

### GET /api/analytics/users

```json
{
  "users": [
    { "user_id": "u-1001", "first_source": "SEO", "created_at": "2026-09-01T03:00:00.000Z" }
  ]
}
```

first_source 当前筛选支持：SEO、直接访问、Bot、社群、邀请、KOL/合作。其他来源可载入，但当前固定来源筛选/分布表未完整覆盖，后端需统一枚举或前端增加动态来源。first_source 是用户首次获客来源；不等于首次有效分析来源。created_at 目前读入元数据但未用于分群入组，不能据此认为无行为注册用户已被统计。

### GET /api/analytics/referrals

```json
{
  "referrals": [
    { "inviter_user_id": "u-1000", "invitee_user_id": "u-1001", "bound_at": "2026-10-01T03:00:00.000Z" }
  ]
}
```

bound_at 为关系正式绑定时间；当前按被邀请者首次有效绑定去重、排除自邀、绑定后7天完成有效分析计算激活。不是分享按钮点击量；没有有效被邀请者的分享者也不在当前推荐者分母内。不要将其他定义的传播K混入当前K。

### GET /api/analytics/trades?start=<ISO>&end=<ISO>

```json
{
  "trades": [
    {
      "trade_id": "trade-1001",
      "user_id": "u-1001",
      "confirmed_at": "2026-10-04T02:05:00.000Z",
      "volume_usd": 125.5,
      "status": "confirmed"
    }
  ]
}
```

volume_usd 为非负 JSON number，交易成交额而非手续费。confirmed 为当前计入的状态。后端必须按 trade_id 去重：前端交易归一化当前没有去重。必须返回全平台符合条件的交易，不能只返回分析用户交易，否则平台总量和贡献比例都不完整。

## 3. 埋点写入接口：建议契约，尚无服务端实现

SDK `src/tracking/client.js` 需要产品传入 send(event)，不会自动发送到某个地址。可接现有采集服务；若新建，建议：

```http
POST /api/analytics/collect
Content-Type: application/json
```

```json
{ "events": [ { "event_id": "evt-0001", "event_name": "module_viewed", "occurred_at": "2026-10-04T02:00:00.000Z", "anonymous_id": "anon-1001", "session_id": "session-1001", "properties": { "module": "fomo" } } ] }
```

成功可返回 `{ "accepted_event_ids": ["evt-0001"] }`。服务端按 event_id 幂等入库并校验事件、时间和身份；登录身份以服务端认证为准。产品端负责队列、重试、跳转时上下文传递，不能因采集失败阻断Token跳转。当前SDK只提供生成与交付事件，不含离线队列、自动页面绑定、POST或跨标签身份系统。

## 4. 尚需对接的页面：建议新增数据

### 渠道分析：建议 GET /api/analytics/channel-stats?start=...&end=...

以下为待实现聚合契约，不是当前代码已经接受的接口。后端计算并冻结归因与人数口径，前端新增 fetch、验证及渲染。

```json
{
  "meta": {
    "start_at": "2026-09-27T17:00:00.000Z",
    "end_at": "2026-10-04T17:00:00.000Z",
    "as_of": "2026-10-05T06:00:00.000Z",
    "timezone": "Asia/Bangkok",
    "attribution": "first_acquisition_source",
    "count_unit": "unique_users",
    "history_complete": true
  },
  "channels": [
    {
      "source": "SEO",
      "visit_users": 1000,
      "login_users": 450,
      "analysis_users": 300,
      "d7_eligible_users": 200,
      "d7_retained_users": 60,
      "trade_users": 70,
      "paid_users": 20,
      "volume_usd": 35000
    }
  ]
}
```

建议访问分母统一为统计期内到访的去重用户，后续登录/分析/交易/付费均是该人群在同一统计期内完成对应行为的人数；D7另以这批人中首次有效分析发生在本期且已观察完整D7的人数为分母。UI应分别标明这些口径，不能把当前演示公式直接当真实算法。付费需成功订单/订阅数据，交易成功不等于付费。现有模块浏览事件只覆盖四个模块，不覆盖全部到访，需产品增加全站 page_viewed/访问事实；当前归一化还不接受该新事件。

只有汇总值不能支持人群下钻。后续建议 `GET /api/analytics/channel-users?start=...&end=...&source=SEO&metric=analysis_users&cursor=...` 返回 `{users:[{user_id:"u-1001"}],next_cursor:null}`，并提供用户事件查询。所有下钻必须复用聚合的筛选口径。

### 价值闭环：先补分析到交易的关联字段

在交易接口增加以下字段，并修改 normalize.js 保留及渲染（当前这些字段会被丢弃）：

```json
{
  "trade_id": "trade-1001",
  "user_id": "u-1001",
  "confirmed_at": "2026-10-04T02:05:00.000Z",
  "volume_usd": 125.5,
  "status": "confirmed",
  "session_id": "session-1001",
  "token_address": "token-address",
  "chain": "solana",
  "token_visit_id": "visit-1001",
  "analysis_event_id": "evt-0003",
  "strategy_event_id": null
}
```

优先显式 analysis_event_id 关联。同一交易最多归属一条分析；不能在多个分析后24h窗口重复计量。无显式关联时需约定同用户+同链+同Token、交易之前最近一次成功分析，并标记推断归因。AI贡献按关联分析前的实际策略事件决定，不能按用户曾经用过AI判断。完整1h/24h结果应区分观察期未满的分析。前端目前真实模式仍禁用价值闭环，需要实现关联计算后才能展示；只增加交易API不够。

## 5. 联调前必须处理的缺口

1. **历史与首次事实**：启动只请求最近90天，无法据此可靠识别历史首次、历史分析用户及老用户流失。建议 users 增加 first_analysis_at、first_analysis_source、first_event_at_by_name 与 history_complete；还需按分群需要补足较早分析记录/历史摘要。当前代码不会使用这些新字段，需同步修改计算层。
2. **无行为用户**：normalize 目前只从事件和交易组装用户。若要覆盖注册后未使用者，必须合并用户表并明确分群分母；单独补 users API 不会自动生效。
3. **身份**：当前匿名关联来自本次返回事件；历史登录关联不在窗口内会断链，匿名ID跨账号登录也需后端消歧。生产建议查询返回服务端解析后的 user_id，并保留匿名ID及首次事实。
4. **交易去重与上下文**：按唯一 trade_id 去重，并保留 session_id/Token/关联字段，才能进入正确会话及价值归因。
5. **事件质量**：规范时间为有限有效时间戳，USD金额为数字，服务端过滤未来/异常事件；当前适配层未对所有字段完整验证。同毫秒顺序当前主要依赖返回顺序，严格漏斗要求后续时间大于前一步，需给真实有序时间或新增 sequence 后修改算法。
6. **完整性与分页**：当前四个GET不支持cursor、分页追读、watermark或超时；额外响应meta暂不使用。对接初期要保证完整数组，禁止静默截断；量大时先改分页/服务端聚合，再投产。
7. **观测截止**：当前 asOf 使用浏览器当前时间，不是数据仓库水位。建议响应增加统一 data_as_of、coverage_start_at、history_complete，并修改启动逻辑，避免延迟入库被误判未回访。
8. **鉴权与环境**：现有fetch未添加Bearer，跨域请求也未开启带cookie凭据；当前没有Vite代理。默认适合同源服务，其他部署方式需提供实际鉴权和代理配置。不能将管理API密钥写进VITE环境变量。
9. **页面实接状态**：渠道/价值闭环明确待获取；四个产品入口未在此仓库里，采集SDK已具备但真实页面需外部接入。配置只保存在浏览器。

## 6. 推荐对接顺序与验收

1. events + users：接登录、四模块、点击、详情、AI、筹码峰；验证身份拼接、重复事件去重、A→B→A→C、来源和自然日边界。
2. 修正首次历史、数据水位、无行为用户池；验证DAA/首次回访/分群与后端查询一致。
3. trades：核对逐笔成交总额与平台汇总，处理去重和会话上下文；再实现分析关联和价值闭环。
4. referrals：核对绑定去重、自邀过滤与7天观察状态。
5. 全站访问 + 付费事实 + 渠道聚合及下钻：最后启用真实渠道页。

运行配置：

```env
VITE_ANALYTICS_DATA_SOURCE=api
VITE_ANALYTICS_API_BASE_URL=/api/analytics
```

重启服务后生效。核心事件/用户接口失败会显示错误，不会回退到模拟数据；推荐/交易可分别缺失。联调需要后端地址、鉴权方式、各接口响应样例及数据覆盖范围，这些目前未提供。

## 7. 分享与邀请链接新增契约

推荐页现已支持分享统计、三类功能表现、按绑定/激活/访问排序的链接排行。使用现有 events、referrals 接口，无需新增独立统计接口。

新增事件：

| event_name | 时机 |
|---|---|
| share_button_clicked | 用户点击主动邀请、分享信号或分享倍数按钮 |
| share_completed | 成功复制链接、生成并交付分享卡片或系统分享功能返回成功；不表示接收方收到 |
| invite_link_visited | 接收方通过邀请链接到达产品；每次有效进入记录一次，UV由分析层去重 |

三类事件 properties 必须携带 referral_link_id、inviter_user_id、share_type（invite / signal / multiplier）。share_method 可取 copy_link / share_card / system_share；信号、倍数分享携带 content_id，建议同时记录 token_address、chain、entry_module。

```json
{
  "event_id": "share-001",
  "event_name": "share_completed",
  "occurred_at": "2026-10-04T02:00:00Z",
  "user_id": "u-1001",
  "anonymous_id": "anon-1001",
  "session_id": "session-1001",
  "properties": {
    "referral_link_id": "link-1001-signal-42",
    "inviter_user_id": "u-1001",
    "share_type": "signal",
    "share_method": "copy_link",
    "content_id": "signal-42"
  }
}
```

访问事件 user_id/anonymous_id 是访问者，不是邀请者；邀请者仅放在 properties.inviter_user_id。referrals 每条绑定关系增加顶层 referral_link_id 与 share_type，以服务端正式绑定归因作为排行依据。后端校验链接归属与类型，同一链接不得对应多个邀请者或多种类型；重试保留 event_id。匿名到登录身份仍按现有规则拼接。

事件数按统计期发生时间，绑定/7天激活按统计期首次绑定关系入组，因此各阶段不可直接相除得到严格转化率。顶栏访问UV全局去重，功能表访问UV按链接累计。缺少 referral_link_id 的绑定列入未归因。来源筛选分别应用于分享者、访问者与被邀请者，各阶段不是同一队列。当前当已取得分享记录（或演示模式）时展示行为统计；无记录无法区分未接埋点与真实零事件，显示待采集，后续可通过API采集能力标识区分。

产品端例子：先获得后端签发的邀请链接ID和归属，再发 share_button_clicked；复制成功或分享功能成功后发 share_completed。不要在点击时提前发完成事件。落地页解析并校验链接后发 invite_link_visited。此仓库不含真实产品分享按钮，SDK与后台已支持，产品端仍需接入。

## 8. Telegram / 邮箱绑定标签

用户分群新增两个非互斥标签，点击标签可查看去重用户列表，来源筛选同步生效。用户查询接口增加账号当前状态：

```json
{
  "users": [
    {
      "user_id": "u-1001",
      "first_source": "SEO",
      "created_at": "2026-09-01T03:00:00Z",
      "telegram_bound": true,
      "email_bound": true
    }
  ]
}
```

字段必须为 boolean：true=当前已绑定（邮箱需验证成功），false=确认未绑定；缺失/null/非boolean=未知。解绑后返回false。同一人可同时拥有两个标签，人数不能相加当总人数。占比为已知绑定人数/当前筛选用户池人数；未知人数在规则说明中单列。整个筛选池状态未知时显示“待获取”。不需要返回邮箱地址或Telegram账号，绑定也不代表通知订阅授权。

**更新第1/5节的旧缺口**：归一化现已合并users接口中没有行为记录的注册用户，以便统计绑定用户。这些用户在现有主要分群规则中归为未激活，主要分群分母现在包含所提供的注册用户。首次历史、数据水位等其他缺口仍未处理。

## 9. 生命周期触达（用户分群内）

六类场景已实现规则评估、启停/渠道设置、待触达人群、执行演示、发送记录及24小时目标行为。真实发送由服务端执行，不在浏览器放Telegram或邮件凭据。`src/lifecycle/worker.js` 提供服务端适配器模板，需服务端接上持久化、原子频控、模板、内容和发送供应商，再配置定时任务；本仓库没有已部署的调度/发送服务。


新增事件：`strategy_result_generated` / `strategy_signal_viewed`，properties携带`strategy_run_id`与`result_id`。实际启动的`strategy_started`也需携带strategy_run_id；只有同次运行的结果生成且30分钟未查看，才进入提醒。

规则ID：first_analysis（登录满30分钟从未分析）、first_strategy（首次分析满24小时且近3天仍分析、从未启动策略）、view_signal（结果生成满30分钟未查看）、inactive_3d（3至28天未分析）、core（近28天至少6个分析日且近3天活跃）、churned（超过28天未分析）。first_strategy只针对近期活跃用户，长期不活跃者进入召回，避免重复推荐策略。

### 已实现前端请求，服务端需提供

`GET /api/analytics/lifecycle?source=all`：source与页面来源筛选一致；返回规则、发送记录及 deliveries_complete=true。Dashboard 计算状态和候选，不需要服务端返回分群或预览。记录展示最近20条，但频控数据必须为当前人群跨来源、跨渠道至少7天完整历史；实际发送由服务端复查。

```json
{
  "deliveries_complete": true,
  "rules": [
    {"id": "first_analysis", "enabled": true, "channel": "auto"},
    {"id": "first_strategy", "enabled": true, "channel": "email"},
    {"id": "view_signal", "enabled": true, "channel": "telegram"},
    {"id": "inactive_3d", "enabled": true, "channel": "auto"},
    {"id": "core", "enabled": true, "channel": "auto"},
    {"id": "churned", "enabled": true, "channel": "auto"}
  ],
  "deliveries": [
    {"id": "message-001", "user_id": "u-1001", "rule_id": "first_analysis", "channel": "telegram", "sent_at": "2026-10-04T02:00:00Z", "status": "sent"}
  ]
}
```

规则使用固定ID，服务端需返回完整六条及完整发送事实；缺失只允许本地预估，禁止提交。Dashboard 勾选并保存规则不自动部署定时任务。

`PUT /api/analytics/lifecycle/rules`：`{"rules":[{"id":"first_analysis","enabled":true,"channel":"auto"}, ...]}`。返回JSON，例如`{"saved":true}`。服务端验证允许的规则/渠道并持久化。只有保存成功的规则才可调度。

`POST /api/analytics/lifecycle/dispatch`：`{"requests":[{"user_id":"u-1001","rule_id":"first_analysis","channel":"telegram"}],"as_of":"2026-10-06T09:00:00Z","idempotency_key":"unique-request-id"}`；返回`{"batch_id":"batch-001"}`。候选由 Dashboard 计算，服务端校验权限、已保存规则、最新目标、订阅和原子频控。view_signal 请求额外传 strategy_run_id/result_id。只处理请求用户，受理不等于送达，不使用 preview_id。

### 服务端执行约束

- 每用户24小时最多一次、同场景7天一次；优先级：查看结果→首次分析→首次策略→3天提醒→核心活动→流失召回。多场景只选择一条。
- 用数据库原子预约保护多worker并发、跨渠道频控，写入queued记录后再发送。发送幂等key传至供应商/发送队列，请求重复提交不能重复推送。
- worker发送错误可能是供应商已接收但返回超时，记unknown并继续占用频控，核对供应商结果后再处理，不能直接重发。供应商确认成功后落库失败也不得把已发送记录改为失败。
- 模板内容、真实市场机会/复盘/高级活动由服务端内容服务提供；当前只定义增长动作，不拼接虚构市场信号。调度建议每15分钟扫描；静默时段、内容有效性由发送服务实施。
- 目标结果按发送后24h观察chip/ai/signal_view/share_complete，查看信号须匹配run/result；未满24h显示待观察。统计是关联结果，不自动生成转化或因果提升。

演示规则存在浏览器localStorage；模拟发送记录仅当前页面会话内存，不持久化到后端。模拟执行一次会添加记录，再执行会被频控挡住。真实接口缺失时显示错误并禁用执行，不回退成模拟发送。

## 10. 用户语言分群

用户分群附加标签新增中文用户、英文用户和语言未知/其他。使用users接口的`preferred_language`字符串：`zh`/`zh-CN`/`zh-TW`等归中文，`en`/`en-US`等归英文；缺失或其他语言单列。语言以用户选择的产品语言为准，不从渠道、邮箱、Telegram或地域猜测。人数与占比按当前来源筛选用户池计算，可与行为分群及绑定标签叠加。界面保持中文，不是双语翻译。

例：`{"user_id":"u-1001","preferred_language":"en","telegram_bound":true}`。生命周期服务端发送适配器可从候选用户的preferred_language选择对应模板；未知语言应使用明确设置的默认模板或暂缓，不自动猜测。发送记录保留preferred_language供核对。

## 11. 通用人群对比

用户分群顶部新增独立人群对比面板。支持最近7/14/28个完整业务日，多条件筛选（语言、首次来源、Telegram/邮箱绑定、首次分析入口、主要分群）与单维度分组。配置单独保存在localStorage，不改变旁边主要分群及生命周期触达条件。

周期表现包括用户池、有效分析、首次分析（载入历史内）、AI策略、当前核心用户、交易用户及推荐者，每个指标人数可下钻，组内占比以本组用户池为分母。用户池排除已知注册/首次观测时间在统计期结束之后的人；不存在时间事实的用户仍保留并依赖后端用户范围完整性。

留存按统一D0日期比较，初始/回访事件均为有效分析，UTC+7自然日，默认选最新D7成熟批次（没有成熟批次则显示待观察）。仅完整观察日进入分母，未成熟不当作0；曲线和表格使用同一计算结果及用户集合。语言目前按当前偏好回看，来源用固定首次来源；首次入口从明确字段或同一token_visit_id上下文取得。历史首次仍受数据覆盖限制。

使用绑定状态或主要分群作为分组/筛选时，留存对比暂禁用：没有入组时状态快照，直接使用当前行为状态会产生选择偏差。后续可增加用户属性历史表，固定入组时语言、绑定状态和早期行为，才能开放历史状态比较。

复用现有events/users/trades/referrals，无新增查询接口。users可补`created_at`、`first_analysis_entry_module`；策略、详情和筹码峰事件应携带entry_module、token_visit_id，以可靠识别首次入口。缺少交易/推荐接口显示待获取。Mock交易为演示日汇总记录，不代表真实交易转化。

## 12. 漏斗及趋势对比视图

人群对比现包含概览、漏斗、留存和趋势四个视图，复用相同周期、条件和分组。保存配置包含当前视图、漏斗类型、1/24/72小时窗口和趋势指标，旧配置可继续载入。

漏斗预设：分析（login→token→chip）和AI（token→ai→chip）。按用户周期内首次起点入组，严格事件顺序，在起点后的窗口内转化，允许后续跨统计期但不得越过观测截至。各组ECharts FunnelChart漏斗图相对起点归一化，明细展示到达人数、逐步转化、已结束未转化与待观察，所有人数可下钻。暂不限制同Token/会话；不是分析到单币交易归因。推荐跨身份链路尚未加入本视图。

趋势展示每日去重有效分析人数或组内每日比例。分母是本组当天结束前已存在的用户，用created_at或首次观测判断，缺少所有时间事实时保留为未知历史用户。每天用户集合、图形和人数下钻使用同一计算结果。动态维度均为当前状态回看，不冒充入组快照，也不证明因果提升。

无新增API，复用现有事件与用户数据。真实数据应提供有效事件时间和注册时间，避免静默截断历史记录。

漏斗视图使用已注册的ECharts FunnelChart插件，每组独立漏斗，点击梯形下钻；筛选重绘、视图切换和离开页面时清理图表、尺寸观察与主题监听。

### 渠道管理更新（2026-10-06）

配置接口 GET/PUT `/api/analytics/channels` 已有客户端；统计聚合使用待实现的 `/api/analytics/channel-stats`，避免同名路由返回不同结构。系统未知渠道固定 ID `unknown`，始终启用，无匹配或缺少来源时兜底。渠道规则变更仅影响后续访问。完整前端事件清单、字段、配置 JSON、服务端职责及验收要求见 [实施文档第15节](GROWTH_TRACKING_AND_INTEGRATION.md#15-渠道管理实施清单)。

生命周期计算边界（2026-10-06）：用户及行为仍来自 events/users，Dashboard 用 evaluateLifecycle/deliveryOutcome 自行计算，刷新按钮仅重读规则和发送记录，不重新加载行为；需要最新行为时重新加载页面。浏览器关闭后自动触达需部署定时任务复用同一规则模块，当前 worker 是待接服务端适配器，没有已运行的定时服务。完整历史缺失仍影响“从未分析”等判断，服务端复查是执行前的必要保护。

后端交付清单已集中到 [实施文档第16节](GROWTH_TRACKING_AND_INTEGRATION.md#16-后端-api-交付清单)，逐项标明 P0/P1/P2、已接客户端或待接、请求和返回内容。生命周期不需后端分群/预览 API，提供规则与完整发送事实、保存规则及执行请求即可。
