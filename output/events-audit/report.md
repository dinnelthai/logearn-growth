# 远程 growth_events 与本地契约差异

检查日期：2026-10-09（Asia/Bangkok）。只读获取2670条事件；表持续写入，结果以保存快照为准。未导入或覆盖SQLite。

基准：output/schemas/growth_events.v2.schema.json（Draft202012，启用format校验）、backend/src/db/schema.sql、前后端事件映射。

## 校验方法

移除仅用于数据库存储的id/server_ts，pg返回的bigint client_ts转整数，properties保留JSON对象后校验。初次校验2670条均因缺顶层session_entry_source不通过。2026-10-09按用户要求将该字段改为可选后，重新校验1959条通过，711条仍有其他错误。这里是行数，不是错误总数。

## 差异

|问题|数量|影响及处理|
|---|---:|---|
|缺顶层session_entry_source|2670|本地SQL允许null；v2现已改为可选，缺失不再报错。124条app_opened_unauthenticated在properties中有该字段。其余未知应为null，不用first_entry_source冒充。|
|signal_viewed缺strategy_run_id|643/876|所有source为strategy_pnl_card；必须核实是否真正对应运行结果。缺ID无法可靠运行关联；不要从result_id猜测运行ID。|
|callout_card_clicked多entry_module/token_visit_id|46|契约该分支不允许额外字段；这些关联字段有用，应扩展分支。前端映射为callout_click，后端eventMap未包含，路径/漏斗两模式存在覆盖差异。|
|strategy_stopped缺strategy_session_id|2/2|违背当前必填契约，无法关联原策略会话。|
|app_version空字符串|20|18 holders_analysis_viewed、1 chip_analysis_viewed、1 chip_analysis_drilldown。版本必填非空，不能编造补值。|
|chip_analysis_viewed字段不一致|1/1|实际is_cache/source_tab/time_range_type；缺cache_hit/analysis_source/token_visit_id/entry_module。is_cache与cache_hit需确认语义后映射，source_tab不可直接当entry_module。|
|顶层与properties.chain不同|1197|按字符串直接比较；包含别名及不同数字，不能全归因为编码差异。策略启动的all/逗号列表是多链语义，应单独定义。前后端优先顶层chain，可能错误关联Token或交易。|
|重复event_id|4组，每组2条|排除id/server_ts后载荷相同，共4条额外重试；按event_id去重，SQLite主键及INSERT OR IGNORE已支持。|

## 观测数据及指标边界

- 17种事件；39个非空user_id，57个非空anonymous_id。两者不可相加当用户数。
- 时间范围：2026-10-08 17:16:24.609—2026-10-09 14:05:44.214 UTC+7。
- 722条Token详情、336条筹码峰下钻，但只有1条chip_analysis_viewed。当前北极星仅认chip_analysis_viewed；不能把下钻直接当成功展示，也不能据此断言产品分析使用量低。
- 未观测到module_viewed、strategy_result_generated、分享/邀请事件。不代表未实现或业务未发生，只代表该快照无记录。
- 13条trade_submitted均有trade_attempt_id；35条trade_succeeded中13条有attempt_id，全部有trade_id；7条trade_failed只有trade_id。需核验实际提交/结果关联，不能用35/13算成功率。当前快照不能提供正式成交USD金额或完整交易覆盖。
- events不替代用户绑定/语言/注册事实、推荐关系和确认交易事实；不能恢复无行为注册用户。
- 现有导入脚本把末条事件时间写成events_complete_through，这是推断水位而非证明完整覆盖。history_complete=false仍不足以证明区间完整性。

原始快照remote-events.json保留真实事件字段（包含身份及可能的钱包字段），报告仅引用聚合信息。审计脚本audit.py与audit-summary.json保留可复核结果。

## 最新处理状态（2026-10-09）

此前表格为初次差异记录。现已按用户要求放宽会话来源、信号查看运行ID、版本、策略停止会话ID及筹码峰展示关联字段；喊单点击扩展关联字段并补齐后端映射。两层chain允许表示不同上下文，业务分析优先properties.chain。最新校验结果见audit-summary.json。
