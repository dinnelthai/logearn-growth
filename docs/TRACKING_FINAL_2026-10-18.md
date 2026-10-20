# logearn-web 最终埋点对应的增长统计口径

## 榜单页面用户点击率

分子：查询时间段内触发 `ranking_token_clicked`，且同段内有对应页面 `page_viewed` 的去重用户。
分母：查询时间段内对应 `page_name` 的 `page_viewed` 去重用户。

| list_type | page_name |
| --- | --- |
| signals | signals |
| trending | trending |
| trenches | trenches |
| strategy_pnl | strategies |

不要求 token_visit_id 或卡片曝光事件。同一人重复访问、重复点击只计一次。没有对应页面访问记录的点击事件单列，不进入分子；分母为空时显示未知。该指标衡量页面访问用户的点击比例，不衡量每张卡片曝光后的点击概率。搜索等没有确认独立页面分母的入口不套用榜单分母。

## 全站页面加载

使用 `page_content_load_started` 和 `page_content_load_finished`，按用户及 `page_load_id` 关联，终态归入发起批次。`presentPageLoad` 是前端函数，不是另一个上报事件。

- `ready`：有 service 数据就绪证据的页面；保留原有数据就绪耗时。
- `presented`：其他页面在首屏呈现时结束；衡量路由开始到首屏呈现（包括路由 chunk 加载和首屏渲染），不保证接口数据已取回。
- 两者均计入完成；中位数/P90 按结果分别计算，不混合。
- 耗时取终态上报的 `duration_ms`；取消、失败、待观察、未知、冲突独立统计。

按页面路径、内容类型、加载类型和设备等维度比较。旧版本只有 started 而没有终态的记录仍为待观察或未知，不补造耗时。卡片曝光的历史计算保留后端兼容，当前界面使用页面用户点击率。
