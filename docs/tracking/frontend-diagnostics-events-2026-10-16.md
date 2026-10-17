# 给产品前端 agent：补充诊断事件与字段

日期：2026-10-16。请基于 logearn-web 当前 master 实现。以下为待实施需求；先完成P0，再做P1。事件由客户端记录事实，比例、分位数、跳出与留存由Dashboard计算。不要在前端直接上报bounce_rate等汇总指标。

## 共同约束

- 沿用src/plugins/logearn_growth/README.md：固定14列信封不变，新增字段全部进入properties；业务调用保持轻量，提取/归一/关联/去重集中adapter/state，不改写业务对象、不侵入策略引擎、不阻塞业务。
- 复用现有event_id、user_id、anonymous_id、session_id、视口和页面关联。网络发送重试保留原event_id、时间、身份、properties；新业务尝试才生成新request/attempt ID。
- properties.chain为本次实际业务链；保留Token地址原链语义，不把大小写敏感链地址无条件小写。未知不猜造。
- 异步操作发起时由埋点层冻结上下文，终态沿用；不得响应后读取当前Token/页面充当发起上下文。显式标记这是origin上下文，避免dispatcher自动补成当前新页面；未呈现页面的ID不能伪造。
- 错误只传稳定error_code/error_stage与安全分类，不能上报原始堆栈、请求体、钱包签名、token/凭证、邮箱或包含敏感参数的URL。

## P0：分析尝试的开始、结果与明确取消

建议新增两个事件，覆盖全生命周期/圈选/内盘等用户主动分析、自动首屏加载和缓存路径；用trigger区分，AI引擎后台分析不混入用户请求指标。若现有事件已表达相同事实，优先复用并补齐同等字段，回传最终名称映射，避免双报。

| 事件 | 触发点 | 必需业务字段 |
|---|---|---|
| analysis_requested | 一次分析业务尝试开始、进入缓存/请求决策之前 | analysis_request_id、analysis_kind、trigger、token_address、chain、发起上下文 |
| analysis_request_finished | 该次业务尝试进入唯一可确认终态 | 同request_id和发起上下文、outcome、duration_ms；结果/失败/取消条件字段 |

字段约定：

- analysis_request_id：尝试UUID；缓存也生成。用户重试为新ID，可选retry_of_request_id。内部请求自动重试仍属同次业务尝试，不重复requested；如需次数可终态带transport_retry_count。
- analysis_kind：稳定枚举，建议full_lifecycle/circle_select/inner/other；按真实业务能力落地并交付映射，不从自由文本猜。
- trigger：user_action/initial_load；只把真实用户发起标user_action，不因有登录账号就这样标。后台刷新不计主动尝试，可不纳入此次事件或单列background_refresh。
- 发起上下文：token_visit_id、entry_module、page_visit_id、page_path、page_name、view_mode；有真实已呈现访问才传，未知省略。可选list_type、analysis_source。终态保留相同origin上下文。
- outcome：success/empty/failed/cancelled。success=有效非空结果成功完成前端格式化并可供界面使用，曝光仍由chip_analysis_viewed记录；empty=成功响应且按业务校验无可用结果；failed=网络/接口/格式化等明确失败；cancelled=业务确实取消这次尝试，不因切后台或仅看见pagehide自动推断。
- duration_ms：发起到终态的performance.now()差值，毫秒、有限非负数；不是可见停留，不扣后台时间，不用server_ts计算。
- cache_hit：能确定时传boolean，未知不填false；result_count：可确定的结果条数，empty为0，未知省略；可选稳定result_id。
- failed：error_stage=network/api/format/render/other，error_code为稳定安全码；不能把格式化完成后的无关后续异常改判分析失败。
- cancelled：cancel_reason=user_cancel/page_left/token_changed/ui_closed/other，只有明确取消时记录；页面离开但请求继续且成功，正常上报成功，不再补cancelled。
- 终态可确定时带origin_view_state=current/left/unknown：明确知道发起页面已结束/换币/关窗才标left；仅隐藏不算left。这帮助区分等待时离开但请求仍完成的场景。
- 每次尝试只发一个业务终态；网络重试不生成新终态。组件卸载/进程强杀导致终态无法确认时可缺失，不能伪造failed/cancelled。后端将单列未知。

将analysis_request_id可选补到对应chip_analysis_viewed/chip_analysis_drilldown，能精确匹配才传；并非每个曝光都一定有新请求，不可为匹配造请求。现有token_visit_id/entry_module补齐继续保留。不得重复报原事件改变现有北极星计数。

## P0：复用已有页面停留事件

page_viewed/page_visit_ended/page_engaged继续沿用当前实现，不再增加第二套计时。page_engaged是累计可见达到10000ms的一次性证据，和ended合并取MAX，不求和。提供首次部署版本/时间边界，确保collect允许page_engaged并保存jsonb。

当前README的首页定义、30分钟分段、有效互动白名单和未知状态由Dashboard落实，不在前端做最终跳出判定。前端不把隐藏/pagehide标为真实关闭，不用心跳假装用户活跃。

## P1：卡片曝光与点击

新增token_card_exposed：信号/热门/搜索/战壕/策略结果/喊单可点击Token卡片真实曝光时报告。复用修正后的可见观察器，检查intersectionRatio>=0.5且document可见；同一页面访问、同一业务卡片最多一次。未达到不报，采用一次性观察而非每秒事件；交付观察超时/降级策略，不把曝光宣称有效阅读。

properties：item_exposure_id、item_id（稳定业务ID，无则使用该次列表内稳定ID）、token_address、chain、list_type、entry_module（维持现有枚举）、position（可确定时提供）、page_visit_id及页面上下文。列表重新刷新相同卡片不重复曝光；新页面访问重建。虚拟列表槽位复用时按业务卡片身份判断。

ranking_token_clicked/callout_card_clicked补item_id和item_exposure_id（曾实际曝光才传）；允许快点未曝光情形，单列点击未匹配，不伪造曝光。别把trenches自动映射fomo，search保持unknown entry_module，按list_type细分。

## P1：登录尝试与失败阶段

新增login_attempt_started、login_attempt_finished，采用login_attempt_id关联。只用于manual，auto_restore仍沿用原事件；暂不要求扩大已接受的移动登录按钮覆盖。

- started：login_attempt_id、login_method（已知真实入口）、source、发起page_visit上下文。
- finished：同attempt_id、outcome=success/failed/cancelled、duration_ms；failed带error_stage=wallet_connect/signature/authentication/other和安全error_code；cancelled带稳定cancel_reason。
- login_succeeded可补同login_attempt_id，仍保留现有session+账号去重。attempt成功数来自新增finished，不能要求被去重的login_succeeded一一对应尝试。
- 只有出现可追踪的阶段流程才传阶段；不凭无成功事件推断登录放弃。账号ID仍使用真实登录态，不伪造未登录身份。

## P1：页面核心内容就绪/失败

新增page_content_load_started与page_content_load_finished，按page_load_id关联，表示该次页面进入的核心内容初次加载，不覆盖每次轮询。page_load_id由埋点层生成并在导航取消时回收；真实呈现后可补page_visit_id，未呈现时保持未知。

- started：page_load_id、load_type=document/spa/float、目标规范page_path、content_type（稳定业务分类）。
- finished：同load_id、outcome=ready/failed/cancelled、duration_ms及可用page_visit_id；failed有error_stage/error_code。初始文档起点为NavigationStart，SPA为该次导航发起，浮窗为打开，统一performance单调时间基准；类型分别分析。
- ready以产品定义的可用核心内容为准，例如列表首批有效数据或详情基础信息，不等待所有非关键组件，不把空DOM/骨架屏当ready。每类页面交付明确ready条件。
- 快速跳转、取消导航只在确知取消时标cancelled；提前离开且未成功呈现也保留load_id证据。不要仅在page_viewed之后开始计时，否则会漏掉加载前离开者。

## 联调交付与验收

每种事件交付最终枚举/字段类型、代码调用点、脱敏payload、部署版本/时间、测试event_id；明确缓存、空结果、失败、取消和未知边界。需采集后端确认新事件白名单、gzip/Beacon兼容、jsonb存储及event_id幂等，不能以HTTP成功替代落库核验。

P0至少验收：新分析成功、缓存、空结果、网络/接口/格式化失败、同币重试、切Token旧响应回来、切后台再回来、浮窗关闭、页面离开但请求继续、发送失败重试。发起上下文不可串到新访问，duration真实非负，UI及引擎流程不受影响。

P1再验收：列表屏幕外/切后台不曝光、虚拟列表复用、登录取消/失败/成功、文档/SPA/浮窗加载、呈现前离开。Dashboard接入取数与指标实现见另一份清单。
