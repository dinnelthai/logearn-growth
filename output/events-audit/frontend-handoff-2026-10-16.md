# 前端交接：Dashboard 核验回执

核验时间：2026-10-16 15:17:33 UTC+7。只读 Hologres；采用 Dashboard 的 eventsCte：event_id 去重、匿名身份唯一账号关联、acc_ 排除及时间有效性过滤。范围为截至快照的全部已观测历史，不是今日/全产品用户；采集完整性未知。本轮未部署或修改统计代码。

## 实库收到的事件

| 事件 | 条数 | 去重身份数 | 关键结论 |
|---|---:|---:|---|
| page_viewed | 3,068 | 108 | page_visit_id、视口字段均有；其中1,668条含token_visit_id |
| page_visit_ended | 6,526 | 101 | page_visit_id全部具备；duration和视口jsonb类型均为number |
| login_succeeded | 325 | 126 | manual 32条/30身份；auto_restore 188条/70身份；历史未知105条/88身份，用户跨组不可相加 |
| ranking_token_clicked | 6,103 | 158 | token_visit_id、entry_module全部具备 |
| callout_card_clicked | 545 | 26 | token_visit_id全部具备，entry_module=callouts |
| token_detail_viewed | 13,447 | 224 | token_visit_id、entry_module全部具备；page_visit_id全部缺失，不能验收详情与具体页面/浮窗关联 |
| chip_analysis_drilldown | 6,970 | 77 | token_visit_id和entry_module全部缺失；870条有page_visit_id |
| signal_viewed | 18,887 | 99 | 已观测，不证明结果总产出 |
| trade_submitted | 537 | 24 | 537条均有attempt |
| trade_succeeded | 757 | 21 | 均有trade_id，仅414条有attempt |
| trade_failed | 121 | 9 | 均有trade_id，仅49条有attempt |
| strategy_started | 226 | 29 | 已观测 |
| strategy_stopped | 116 | 28 | 已观测，不证明每段运行都可配对 |
| invite_page_entered | 18 | 14 | 已观测 |
| language_changed | 60 | 24 | 已观测；不等于用户资料语言已更新 |
| limit_order_created | 33 | 10 | 创建不等于成交 |

未观测到 chip_analysis_viewed、invite_link_copied、strategy_result_generated；只能说当前查询范围没有记录，不能断言用户没用、未部署或服务端没实现。首访345条/340身份，未登录打开754条/339身份，登录按钮196条/85身份；首次采集不等于全生命周期新用户。

入口核验：signals→signals 1,798条；trending→popular 1,479条；search→unknown 1,225条；strategy_pnl→unknown 862条；trenches→unknown 739条。与交接一致，不能擅自把战壕改为fomo或搜索改为新entry_module。可独立用list_type细分已采集点击入口。

## Dashboard 接收结论

1. 保留现有14列信封与properties；业务链优先properties.chain。现有Hologres入口已有身份关联、事件去重和UTC+7自然日处理。
2. 页面与浮窗字段、视口、MAX累计停留已在现有适配内。此次核实数据类型为number；历史缺失保持未知；pagehide不作为真实退出。
3. 主动登录继续只用明确manual。交接要求历史缺类型视为主动，与Dashboard现有保留未知冲突，也缺逐条证据。本轮不自动改写历史统计，列为双方待定。
4. 北极星延续此前用户确认的“成功完成筹码分析或下钻的每日去重身份”，当前兼容viewed/drilldown并集；本快照实际全部来自下钻。交接把viewed称北极星，不能据此未经确认改为仅viewed，否则当前会归零。完成与曝光定义须双方统一。
5. 点击→详情可用token_visit_id；点击→详情→viewed当前没有终点样本；若使用下钻作为终点，全部缺访问ID，无法做同次访问关联。用户级顺序只能另标口径，不能冒充同次访问漏斗。
6. 详情page_visit_id零覆盖需产品排查token/chain匹配、呈现时序与部署版本。不能把有token_visit_id等同已有page_visit_id。
7. 交易监控现有逻辑已区分提交批次、订单终态、缺关联及冲突；不使用757/537作为成功率。成功终态343条、失败终态72条缺attempt，需要继续单列。现有“已关联订单成功率”与建议“至少一单成功的attempt占比”是不同指标，不擅自替换。send_amount不计USD成交额，分析到交易不补造token访问关联。
8. 策略运行ID可选和跨刷新边界保持；邀请复制不等于分享完成，更不等于正式绑定。无事件不补零、不推断收益或结果产出。

## 给产品前端的反馈

已收到并核对交接。页面/停留/登录/点击/详情/下钻等已确认有实库记录，入口枚举与说明一致。目前阻塞完整分析漏斗的是：chip_analysis_viewed未观测、下钻全部缺token_visit_id/entry_module，以及详情全部缺page_visit_id。请针对一个测试账号执行点击→详情→展示→下钻，提供版本及各event_id，排查首次筹码节点渲染/曝光上报、详情页面关联和下钻发起上下文。历史无login_type保持未知还是视为主动，以及北极星完成/曝光定义，需要明确统一；本轮Dashboard未擅自变更。交易事件条数多于提交次数符合一attempt多终态的可能性，须按真实ID核对，不能仅靠数量认定重复。

证据：[聚合核验JSON](frontend-handoff-2026-10-16.json)。文件不含账号名单、钱包地址或连接凭证。当前权限/分页属于既有Dashboard实现，本次未做API鉴权与分页端到端复测；入库快照也不能替代浏览器→collect→数据库的逐event_id验收。
