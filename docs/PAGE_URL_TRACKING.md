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

## PR #26 对接（2026-10-15）

对照 logearn-web PR #26，提交 `939007bdf957dffdb02df1e33baf7853e2c21835`：

- 页面路径优先读取 `properties.page_path`，兼容历史 page_url/path 和信封 page；page_name、view_mode（page/float）、navigation_source、previous_page_visit_id/previous_page_path 与 page_visit_id 一起保留。
- 页面停留仍使用 `visible_duration_ms`，同一用户同一 page_visit_id 的检查点取最大累计值；排除快照之后的检查点。宿主页和浮窗各自按访问 ID 关联，缺失时长显示未知。end_reason 仅是生命周期信号，不证明退出。
- login_succeeded 保留 login_type：manual / auto_restore；历史缺字段保持未知。登录成功总口径包含两类，用户时间线区分显示；自动恢复不作为单页无操作诊断的主动操作。
- 远程行为路径、远程漏斗事件加载、SQLite 事件加载与前端原始数据归一保留新属性；viewport_width/viewport_height 来自事件发生时快照，页面记录使用自身尺寸。
- 只读落库核验：page_viewed 243 条、page_visit_ended 498 条，均具备 page_path/page_visit_id/viewport_width；login_succeeded 中 auto_restore 25 条、manual 4 条、历史无类型 105 条。数量为核验时快照，并非固定预期。
- 真实最近 24 小时路径查询及页面统计跑通：127 个路径用户、898 条页面/业务上下文记录，其中 198 条具备可关联时长；事件加载同时返回历史未知、auto_restore 和 manual 登录。
