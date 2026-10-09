# LogEarn 四项分析数据契约 v2

本次在用户提供的原 Schema 上补齐北极星、漏斗、留存、用户分群所需字段，保留原事件枚举及各事件原有字段；公共字段 session_entry_source 已调整为可选，其余公共必填字段保留。文件是数据契约，不表示生产环境已完成上报，也没有修改产品代码。

## 文件

- `growth_events.v2.schema.json`：单条事件校验，前端和业务后端事件使用。
- `analytics_facts.v2.schema.json`：用户、正式邀请关系、已确认成交和事件覆盖响应分别校验；与事件 Schema 放在同一目录，并将事件 Schema 的 `$id` 注册到校验器。`$id` 是标识，不表示这些网址已部署。
- `growth_events.v2.examples.json`：8 个事件和 4 个接口响应示例。示例 ID、金额、时间均为虚构；示例标记 history_complete=false，不声称具有全历史。

事实 Schema 使用规范化接口结构：`{users: [...]}`、`{referrals: [...] | null}`、`{trades: [...], meta: ...}`、`{logearn_events: [...], meta: ...}`。这是对接目标结构；当前不同来源接口可能使用 `logearn_users`、`logearn_user_referral` 等包装名，需在适配层映射。每个响应单独校验，示例总文件不是单个接口响应。

## 相较原文件的修改

1. 点击、Token详情、筹码峰分析事件增加必填 `token_visit_id` 和 `entry_module`。entry_module 枚举为 callouts/signals/popular/fomo/unknown；不是外部渠道来源，无法判断时明确 unknown。保留原来的 list_type、entry_source、analysis_source，不能自动当作 entry_module。
2. 策略启动增加必填 `strategy_run_id`，将 `strategy_type` 设为必填；保留原来必填的 strategy_session_id、strategy_id。停止和心跳允许带 run_id。strategy_session_id 表示旧会话概念；只有业务证明其与实际运行一一对应时，才可由适配层映射到 run_id。strategy_id 是策略配置标识，strategy_type 是稳定的种类，不能用不同配置 ID 冒充不同种类。
3. 新增 strategy_result_generated，由业务后端在真实结果生成时报告，必填 run_id/result_id。新增当前代码支持的 strategy_signal_viewed 别名，语义与 signal_viewed 相同。生产选择一个名字上报，不能对一次查看两个名字同时上报。
4. signal_viewed 保留必填 result_id，strategy_run_id 暂为可选，匹配当前 tracker 的校验规则。这里指策略结果成功展示。若产品原 signal_viewed 还包含不属于策略运行的公共榜单信号展示，必须在产品接入时区分语义；不得伪造运行/结果 ID。通用信号展示需另行约定事件或扩展分析映射，本契约没有声称它与策略结果查看等价。
5. 交易提交、成功、失败增加 trade_attempt_id/trade_id 至少一个；若两个都有则同时传递。原 op_type、chain、token_address 等规则保留。
6. 登录成功条件要求真实非空 user_id；保留稳定 anonymous_id，以合并登录前的匿名行为。
7. 保留必填 client_ts，允许可选 occurred_at 和 schema_version=2.0。first_visit_at 同时兼容原毫秒整数和现有 tracker 的 ISO 字符串。使用当前仓库 tracker 时，仍须增加其未输出的原公共必填字段，并将 occurred_at 转成 client_ts；本次未修改 tracker。
8. 用户事实增加首次分析、首次来源、首次分析入口、语言、绑定三态。lang/language_changed 不会自动更新 preferred_language，需用户系统同步。语言事实标准化为 zh/en/unknown。

## 上报语义与跨记录校验

- chip_analysis_viewed：筹码峰成功展示才上报；缓存成功展示可上报；请求发起、加载失败和不可见预加载不算成功展示。一天重复行为由分析端按用户去重，不能由产品提前删除不同的真实行为。
- token_visit_id：每次新的 Token 访问生成新 ID；点击→详情→分析共用；新访问不得复用。没有榜单点击的直达访问仍生成访问 ID。
- strategy_started：策略实际成功开启才上报；界面恢复、保存配置、心跳不等于启动。同次真实运行的启动、结果、查看共用 run_id，每个真实结果有稳定 result_id。
- trade_succeeded：链上或业务后端确认成功才上报。一次尝试有稳定 attempt_id，成交有全局唯一 trade_id；失败重试若是新尝试生成新 attempt_id。USD金额由后端成交事实提供，不能用原币 amount 替代。
- 首访快照固化一次；缺来源不能猜造；会话来源不能覆盖首次来源。
- event_id 表示一次真实事件，网络重试复用；新行为使用新 event_id。用户 ID、匿名 ID、时间不能为空或伪造。事件时间不得晚于快照 asOf。
- 同一事件顶层 chain 可表示外层当前网络；properties.chain 表示本次内部业务实际链，允许两者不同。分析优先 properties.chain，缺失时回退顶层 chain。原 Schema 的部分 properties.chain 允许数字，为兼容保留；接入层应统一字符串链标识，避免同币链匹配失败。
- 当前漏斗要求严格时间递增，同毫秒不能确认先后；记录真实足够精度的发生时间，不能为使漏斗成立伪造时间。
- 正式邀请排除自邀，首次绑定不可冲突；交易 ID 对应的用户、金额、确认时间不可冲突。

JSON Schema 校验类型、必填、枚举和单记录结构。跨事件身份、时序、ID一致性、交易确认真实性及金额换算必须由业务系统/接入层验证。

## 历史与覆盖

用户池需要包含无行为注册用户。首次分析事实是历史事实，不能伪造当日行为；默认留存需要首次分析日及后续真实 chip 事件。回流判断需要间隔之前的历史事件，只有近28天截取不能完整判断回流。

events/trades 的 start_at 与 complete_through 表示服务端能够证明连续完整的覆盖区间，当前分析按半开区间解释。未知填 null；不得从首条/末条记录推断完整覆盖。history_complete=true 仅在能够确认必要全历史时声明。未提供的关系/交易数据可用 null；已提供且无记录用 []。单纯数组为空不能证明覆盖完整。

## 当前分析代码的边界

- 原始主分群“策略型”使用已观测全部历史策略种类；聚合特征使用近28天种类，需统一实现后才能保证两模式相同。
- 聚合主分群按特征重建快照计算；请求asOf变化时，需要同步重建对应28天特征。
- 原始与聚合用户池、匿名身份纳入方式存在差异；不能因 Schema 合法就认定两模式人数相同。
- 聚合人群对比目前有概览和漏斗，留存/趋势视图尚未实现。
- 生命周期只生成候选，无实际发送；规则不同于8类主分群，不能把命中人数当作可触达人数或发送人数。

## 已执行验证

使用 JSON Schema Draft 2020-12 校验器和 format 校验：2份 Schema 结构通过；8个事件、4个响应正例通过；9个缺关联ID、缺策略种类、登录缺用户或多余字段反例均被拒绝。未执行生产上报联调。

## 会话来源兼容调整（2026-10-09）

session_entry_source 为可选字段，缺失不阻断事件契约校验或北极星计算；提供时仍仅允许 string/null。缺失代表本次会话来源未知，不用 first_entry_source 自动补值。

## 策略运行关联暂缓（2026-10-09）

用户决定暂不要求 signal_viewed 的 strategy_run_id，兼容别名 strategy_signal_viewed 同步改为可选。记录信号查看即可；缺失运行ID时不能可靠归因到某次策略运行，相关漏斗与未查看结果分析待后续补齐。不影响北极星。其余事件的运行ID要求不变。

## 业务链优先级（2026-10-09）

用户确认内部榜单切换可导致两层chain不同，分析优先采用properties.chain；仅缺失时回退顶层chain。原始事件保留两层字段，不改写历史记录。链名称/数字编码及策略多链值仍按原值保留，不猜测转换。

## 现有事件兼容放宽（2026-10-09）

app_version允许省略、空字符串或null；strategy_stopped的strategy_session_id改为可选；chip_analysis_viewed仅保留token_address/chain必填，兼容is_cache/source_tab/time_range_type，缺关联字段时不能可靠做Token访问关联；callout_card_clicked允许可选entry_module/token_visit_id。后端补齐callout_click映射、路径类型和关联上下文读取，与前端一致。重复event_id继续按现有逻辑去重。
