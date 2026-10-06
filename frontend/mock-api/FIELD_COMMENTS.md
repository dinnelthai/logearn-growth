# Mock JSON 字段说明

接口使用同名 `.json`；带行内中文注释的 `.jsonc` 供阅读，不作为标准 JSON 响应。所有数据为合成示例。

| 字段 | 中文说明 |
|---|---|
| `users` | 用户数组，包含没有行为的注册用户；对应 GET /users |
| `events` | 原始行为事件数组；对应 GET /events，event_id 用于去重 |
| `referrals` | 服务端确认的正式邀请关系数组；对应 GET /referrals |
| `trades` | 交易事实数组；对应 GET /trades，不等同于付费订单 |
| `rules` | 可配置渠道规则数组；固定未知渠道 unknown 由 Dashboard 展示，不在此普通规则数组内 |
| `user_id` | 业务用户稳定 ID，与用户、事件和交易关联；原始接口不加 user: 前缀，未登录事件可为 null |
| `created_at` | 注册时间，UTC ISO 8601 字符串；本 Mock 使用最早行为前一分钟作合成注册时间 |
| `first_source` | 用户首次来源分类；本版沿用 SEO/直接访问/Bot/社群/邀请/KOL/合作。权威首次获客与首次分析来源仍需分开接入 |
| `preferred_language` | 用户选择的产品语言：zh 中文、en 英文；null 表示未知，不从来源猜测 |
| `first_analysis_entry_module` | 首次有效分析的站内入口：callouts/signals/popular/fomo；null 表示未提供，不等同于外部渠道 |
| `telegram_bound` | 当前 Telegram 是否已验证绑定，boolean；null 或缺失表示未知。本字段不包含联系人信息 |
| `email_bound` | 当前邮箱是否已验证绑定，boolean；null 或缺失表示未知 |
| `telegram` | 是否明确允许 Telegram 通知，true/false；允许通知仍需已绑定 |
| `email` | 是否明确允许邮件通知，true/false；允许通知仍需已绑定 |
| `event_id` | 事件唯一 ID；同一事实重试保持此 ID，不产生重复计数 |
| `event_name` | 原始事件名称；详见 FIELD_COMMENTS.md 中的事件名称表，未支持名称会被当前适配器忽略 |
| `occurred_at` | 行为实际发生时间，UTC ISO 8601 字符串；业务日期按 Asia/Bangkok（UTC+7）统计 |
| `anonymous_id` | 匿名访问者稳定 ID；登录事件同时带 user_id 和 anonymous_id，用于匿名身份合并 |
| `session_id` | 会话 ID；同一会话共享，用于行为路径；当前 SDK 达到30分钟无操作会换会话 |
| `first_entry_source` | 旧接口兼容来源字段，当前映射到事件 entry_source。Mock 可能随事件变化，不是服务端冻结的全局首次获客事实 |
| `properties` | 事件业务上下文，只提供与该事件有关的字段；缺失和 null 不应补成虚假事实 |
| `module` | 当前展示或点击的模块：callouts 喊单、signals 信号榜单、popular 热门、fomo FOMO热门 |
| `entry_module` | Token/分析的站内入口模块，与 UTM 获客平台不同；外部直达可为空 |
| `strategy_type` | 策略类型，例如 1.5段、日内2段；当前归一化映射为 strategy |
| `strategy_run_id` | 一次策略运行的稳定 ID，启动、结果生成、结果查看以此关联；独立于用户 ID |
| `result_id` | 一次策略结果的稳定 ID；与 strategy_run_id 配对，判断该结果是否已查看 |
| `token_visit_id` | 同一次 Token 点击、详情和后续分析的访问关联 ID；不同于全站 visit_id（待接入） |
| `token_address` | 代币合约地址；本版 mock-token-* 为合成占位值，不是真实地址 |
| `chain` | 链标识，本版 solana；与 token_address 共同识别资产 |
| `position` | 模块列表展示/点击位置，本 Mock 从1开始；整数 |
| `referral_link_id` | 邀请/分享链接稳定 ID，关联分享事件、访问事件与正式邀请绑定 |
| `inviter_user_id` | 邀请人业务 ID；访问事件顶层 user_id 是访问者，不能用邀请人覆盖它 |
| `invitee_user_id` | 被邀请人业务 ID；正式首次绑定关系应由后端确认，不能自邀 |
| `share_type` | 分享功能：invite 主动邀请、signal 信号分享、multiplier 倍数分享 |
| `share_method` | 分享操作方式，例如 copy 或平台调用；完成操作不代表发布成功或收件 |
| `content_id` | 被分享的信号/素材稳定 ID，关联具体分享内容 |
| `bound_at` | 邀请关系正式绑定时间，UTC ISO；推荐统计按此时间入组 |
| `trade_id` | 交易唯一 ID，后端应去重；当前交易适配器尚未按此 ID 去重 |
| `confirmed_at` | 交易确认时间，UTC ISO；按此时间筛选交易统计窗口 |
| `volume_usd` | 成交额，USD 非负 number；不是手续费、订单金额或利润 |
| `status` | 交易状态，本版 confirmed；只有 confirmed 才计入当前成交统计 |
| `id` | 渠道稳定 ID；改名不改变 ID，系统未知渠道为 unknown |
| `name` | 渠道显示名称，不作为稳定关联键 |
| `conditions` | 六字段精确匹配条件；多个条件为 AND，未填字段不限制 |
| `utm_source` | 发布平台：x / telegram / partner_site / binance_square（币安广场） |
| `utm_medium` | 推广方式：owned_social / kol / community / referral |
| `utm_campaign` | 活动标识，例如 ai_trial / case_class |
| `utm_content` | 帖子/素材标识，例如 day6_extra100k_v1 |
| `partner_id` | 稳定合作方/KOL ID，例如 kol_001；没有则为空 |
| `placement_id` | 具体账号/群/位置 ID，例如 official_x；没有则为空 |
| `priority` | 渠道匹配优先级，非负整数，数字越小越优先；相同值按 ID 排序，最多归一个渠道 |
| `enabled` | 渠道是否参与新访问匹配；停用保留历史，unknown 始终启用 |
| `version` | 渠道配置版本，新增从1开始，编辑/启停递增；历史归因保存原版本 |
| `updated_at` | 配置更新时间，UTC ISO；null 表示未修改的默认规则 |
| `fixture_version` | 本套 Mock 文件版本，不等同于渠道配置版本 |
| `system` | 是否系统固定渠道；unknown 为 true，不能编辑或停用 |
| `condition` | 生命周期场景的显示条件；实际判断由 Dashboard 规则函数执行 |
| `action` | 生命周期建议增长动作，仅作展示，不执行发送 |
| `goal` | 场景目标行为的内部事件类型 |
| `channel` | 规则通知渠道偏好，本版只分析，不调用发送服务 |
| `records` | 渠道首次获客事实数组，与 users/events/trades 按 user_id 关联 |
| `channel_id` | 冻结的首次获客渠道 ID，关联 channels.rules.id，unknown 为未知渠道 |
| `channel_version` | 首次获客时匹配的渠道配置版本，后续修改不覆盖 |
| `first_visit_at` | 首次获客访问时间，UTC ISO；渠道页按此时间入组 |
| `source_fields` | 入口六字段，保留平台、活动、素材和推广方式 |
| `payments` | 成功订单事实样例数组；空数组表示明确无订单，缺失表示未提供 |
| `order_id` | 订单稳定 ID |
| `paid_at` | 订单支付成功时间，UTC ISO |
| `amount_usd` | 订单支付金额，USD，与交易成交额不同 |
| `attribution` | 归因口径，本版 first_acquisition_source，首次获客来源 |
| `scenarios` | 本套文件覆盖的合成测试场景，用于核查展示范围 |
| `generated_at` | 本套 JSON 的生成时间，UTC ISO |
| `as_of` | 生成器的数据观测截止时间，UTC ISO；当前 API 页面仍以浏览器当前时间为截止，不自动读取此文件 |
| `start_at` | 主要演示周期起点；生命周期流失样例有更早历史事件，此值不是最早事件时间 |
| `timezone` | 业务时区，Asia/Bangkok 即 UTC+7 |
| `counts` | 各类 Mock 原始记录数量，用于校验文件完整性 |
| `routes` | 本地 GET 路径到响应 JSON 文件的映射，非后端已上线证明 |

## 当前事件名称

| event_name | 含义 |
|---|---|
| `login_succeeded` | 登录成功 |
| `module_viewed` | 模块展示，module 决定四种入口 |
| `token_opened` | 点击 Token |
| `token_detail_viewed` | 详情成功展示 |
| `strategy_started` | 策略实际启动成功 |
| `chip_analysis_viewed` | 有效分析结果已展示 |
| `strategy_result_generated` | 策略结果生成，实际产品应由服务端记录 |
| `strategy_signal_viewed` | 查看对应策略信号 |
| `share_button_clicked` | 点击分享按钮 |
| `share_completed` | 完成可验证的分享操作 |
| `invite_link_visited` | 访问经验证的邀请链接 |

## 当前数据没有的目标字段

`page_viewed`、全站 `visit_id`、渠道归因快照 `channel_id/channel_version`、权威首次获客/分析摘要尚未接入本版数据适配；不要把 token_visit_id 或旧 first_entry_source 当作这些字段。六个 UTM 字段目前出现在渠道配置条件内，尚未自动落入当前 Mock 事件。

生命周期状态按用户/行为由 Dashboard 计算；绑定和订阅偏好不代表已启用发送服务。
