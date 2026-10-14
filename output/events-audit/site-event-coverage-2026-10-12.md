# 产品事件调用与实库覆盖清单

采集快照：2026-10-12T02:22:50.284Z。静态检索显式全局调用；动态事件 trade_terminal 由 adapter 转为成功/失败，不能仅凭调用数量判定遗漏。无记录不等于业务未发生。

| 事件 | 实库事件数 | 实库身份数 | 产品显式调用点 |
|---|---:|---:|---|
| module_viewed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| app_opened_unauthenticated | 307 | 187 | src/bootstrap/app.vue:218 |
| login_button_clicked | 40 | 29 | src/pages/layout/earn/pc/header.vue:63 |
| wallet_connect_submitted | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| wallet_connect_succeeded | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| wallet_connect_failed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| login_succeeded | 50 | 42 | src/plugins/web3/metamusk.ts:377 |
| logout | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| page_visit_ended | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| page_viewed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| token_detail_viewed | 4112 | 126 | src/pages/tokens/detail/index.vue:669 |
| token_detail_tab_switched | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| search_performed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| ranking_token_clicked | 2049 | 92 | src/pages/layout/earn/_search_address/search_modal.vue:315<br>src/pages/tokens/agent_strategies/_partials/PnlHitCard.vue:85<br>src/pages/tokens/ai_copy/service.ts:257<br>src/pages/tokens/signals/_partials/24h_gold_dog.vue:36<br>src/pages/tokens/signals/_partials/SignalsGroupList.vue:136<br>src/pages/tokens/signals/token_card/index.vue:71<br>src/pages/tokens/signals/token_card/side_modal.vue:89<br>src/pages/tokens/trenches/_trenches_token.vue:189<br>src/pages/tokens/trending/_partials/_token_table/top_dog.vue:82<br>src/pages/tokens/trending/_partials/_token_table/followed.vue:66 |
| language_changed | 20 | 10 | src/pages/layout/earn/_global_setting.vue:21 |
| chip_analysis_viewed | 0 | 0 | src/pages/detail/_partials/_trading_view/_price_distribution/index.vue:104 |
| chip_analysis_drilldown | 2075 | 53 | src/pages/tokens/detail/analysis/service.ts:472 |
| holders_analysis_viewed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| cluster_explorer_opened | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| signal_viewed | 4380 | 31 | src/pages/tokens/agent_strategies/_partials/PnlHitCard.vue:78 |
| signal_clicked | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| callout_card_clicked | 229 | 14 | src/pages/tokens/detail/callout/callout_card.vue:291 |
| trade_submitted | 364 | 16 | src/components/ui/trade/full_modal/service.ts:163<br>src/components/ui/trade/full_modal/service.ts:439 |
| trade_succeeded | 525 | 13 | 未检索到显式调用；需核对 adapter/后端责任 |
| trade_failed | 81 | 5 | 未检索到显式调用；需核对 adapter/后端责任 |
| limit_order_created | 21 | 7 | src/components/ui/trade/full_modal/service.ts:198<br>src/components/ui/trade/full_modal/service.ts:489 |
| dca_order_created | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| token_followed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| token_unfollowed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| address_followed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| address_unfollowed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_started | 86 | 21 | src/pages/tokens/agent_strategies/index.vue:266 |
| strategy_stopped | 38 | 17 | src/pages/tokens/agent_strategies/index.vue:270 |
| strategy_heartbeat | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_created | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_edited | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_deleted | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_backtesting_run | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_result_generated | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| mint_submitted | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| mint_succeeded | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| reward_claimed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| invite_link_copied | 0 | 0 | src/pages/rewards/_partials/_balance_display.vue:16 |
| notification_clicked | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| invite_page_entered | 14 | 11 | src/pages/layout/earn/login/user_info.vue:62 |
| first_visit_captured | 187 | 186 | src/bootstrap/app.vue:216 |
| token_opened | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| strategy_signal_viewed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| share_button_clicked | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| share_completed | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
| invite_link_visited | 0 | 0 | 未检索到显式调用；需核对 adapter/后端责任 |
