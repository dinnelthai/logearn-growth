# 页面 URL 与入口页诊断

后台：行为路径 → 入口页分析、用户访问记录。用户分群 → 单页访问无操作、代币详情未分析。首页提供行为路径入口。

产品代码位于 ../logearn-web：bootstrap/app.vue 接首屏及成功路由切换；plugins/logearn_growth/pageVisits.ts 负责去重、URL 清洗、可见停留和生命周期。复用现有匿名/登录身份、session_id 与上报通道；未部署线上。

- page_viewed：page_visit_id、page_url、path、route_name、previous_page_url、referrer_url、is_entry。
- page_visit_ended：相同 page_visit_id 与 URL、visible_duration_ms（累计）、reason。隐藏/关闭/路由切换上报检查点；多次检查点取最大累计值，不相加。页面隐藏时间不计入；未记录停留则显示未知。
- URL 不保留 query/hash/用户名密码。入口为首个已观测页面；历史缺口下不能保证实际落地页。没有 referrer 不证明直接输入 URL。
- 登录及匿名身份复用现有规则；acc_ 排除延续现有数据库过滤。
- 单页无操作：期内起始的已观测会话恰好一个 page_viewed，未观测主动核心操作，最后业务行为距快照至少30分钟，窗口外无后续行为。被动展示详情/模块和停留检查点不算主动操作。
- 代币详情未分析：同范围有页面记录、详情展示，无 chip_analysis_viewed / chip_analysis_drilldown，达到上述观察要求。用户级标签指至少一个满足条件的会话；并非该用户全周期从未分析。
- session_id 优先；缺失时30分钟拆分。入口表最多100种 URL，记录最近1000条并注明截断；客户端搜索/分页只作用于这些记录。

上线验收：产品构建发布；确认现有 collect 接口允许新增的两个事件（对应 schema 已更新）；直接打开详情 URL、不登录离开、站内跳转、前进后退、隐藏再返回各一次，查 Hologres 的 event_name、page_visit_id 与停留记录。当前历史库缺少有效 page_viewed，无法回填历史 URL/真实停留。

修正：历史业务事件信封的 page 字段已有页面路径。页面 URL 列表已接入该字段，连续相同上下文合并，并标记“业务事件所在页面”。此类记录不证明每次页面打开，不用于单页无操作判定；入口按首个已观测上下文统计。仅真实 page_viewed 会话可判断单页无操作。
