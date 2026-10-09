# 百万事件规模实时分析架构设计

日期：2026-10-09。本文是设计，不表示已部署；不修改远程表。百万指累计原始事件100万条，不是每日100万或百万用户。按单个部署、10个同时在线分析人员设计，峰值增长速度和实例资源尚待测量；若实际规模不同重新压测。

## 决策及目标

采用Hologres存储事件与分析事实，Express提供指标API，浏览器只接收聚合和分页明细。SQLite保留操作账户、会话、分析配置、自定义人群，停止持续复制远程事件。近期不引入Kafka、CDC或WebSocket。简单指标远程SQL查询，复杂分析采用后台作业与可复用结果。

目标而非已实测承诺：缓存命中P95小于300ms；北极星/渠道/交易冷查询P95小于2秒；漏斗/留存小于5秒，否则返回作业ID；路径分析可异步，目标15秒内完成。常用卡片可见延迟目标30–60秒，包含源端可见性、计算发布和页面轮询；复杂作业允许明确显示旧版本及更新时间。任意一层失败不能显示为0。

## 结构

浏览器 → Express认证/参数验证 → 指标服务 → Hologres连接池
                                      ↘ 有界结果缓存
                                      ↘ 有界异步分析作业
SQLite：账户、会话、配置、cohort成员、作业元数据；禁止持久化原始事件。
Hologres：growth_events原始表 → 规范化事件层 → 首次事实/用户日行为/特征快照 → 指标SQL。

生产后端部署在接近Hologres的可持续运行环境；浏览器不持有数据库凭据。本地仅用于开发。新增分析表需要写权限，独立分析schema及独立账号；API账号只读。若暂时没有建表权限，第一阶段用受限SQL查询原始表，不把它当作规模化完成。

## 统一语义层

规范化层保存event_id、raw_event_name、event_type、event_time、server_ts、user_key、explicit_user_id、session_id、business_chain、token_address、token_visit_id、strategy_run_id、result_id、strategy_type、首次来源、entry_module。

- event_time沿用client_ts毫秒；server_ts用于入库新鲜度，不替代真实发生时间。统计UTC+7、半开区间[start,end)。客户端未来时间、异常类型进入质量计数。
- 已登录访问：任意原始事件具有非空user_id，即使事件名未进入分析词汇。匿名事件不能因之后身份合并而被算成当时已登录。相同详情事件可同时证明登录访问和详情，后续真实业务步骤仍严格递增。
- 有效分析：chip_analysis_viewed或chip_analysis_drilldown；按规范用户身份去重。
- business_chain优先properties.chain，缺失回退顶层；保留原字段。空值和名称/数字编码需显式定义，禁止猜测转换。策略all/逗号列表独立为strategy_chain_scope，不能作为单币链标识。
- 喊单点击映射callout_click，保留token访问关联。缺运行/访问ID可以做用户顺序分析，不能伪造关联后参与强关联漏斗。
- event_id去重：同载荷重试保留一次；同ID不同载荷记录冲突并排除或按明确治理规则处理。不能假设源表已唯一。
- 复用前后端现有算法测试作为SQL实现的验收基准；逐步停用浏览器业务计算，单一服务端口径。

## 远程分析表

1. analytics_events：规范化、去重的事件事实。原始表保持不变；热点字段提取为列，减少查询反复解析JSON。
2. analytics_user_facts：每用户首次登录、首次分析时间、首次来源及身份关联事实。缺历史时首次观测不能冒充真实首次。
3. analytics_user_day：business_date × user_key，包含分析次数、是否显式登录访问、分析/登录首末时间和渠道维度。保留用户级日事实以支持跨日精确去重。
4. analytics_user_features：按公布as_of构建近28天活跃天数、策略种类、最近分析、回流等。绑定和语言来自正式用户事实，不从事件猜测。
5. analytics_snapshot：每个已发布版本的as_of、build_time、source_seen_at、history_complete和真实覆盖证明。

周期人数是COUNT(DISTINCT user_key)，不能累加每天UV；跨渠道聚合也不能简单求和。百万事件下优先精确去重，不使用近似值。每日摘要可缓存，用户日表行数最多接近事件数，仍需远程保留策略，不能宣称汇总一定很小。

Hologres物理设计候选：时间范围扫描使用event_time裁剪；用户时间线使用user_key/event_time聚簇；事实与用户日表按user_key分布有利关联。时间扫描与用户查询存在取舍，先EXPLAIN/压测再选择；不是创建一套普通Postgres索引。聚簇键调整可能要求新表迁移，不能在线盲改生产。实际实例前次显示4.1系列，不假定4.2功能；动态表不是上线前提。

## 按页面计算

北极星：用户日表精确去重及首次事实，查询每日分析、已登录访问、新分析/回访；包含截至日进行中。
渠道：首次归因事实JOIN用户日表；来源过滤使用首次来源，不能在不同页混用事件当前来源。
交易：确认交易事实提供金额/状态；事件提供提交/结果关联。事件amount不直接当USD，缺正式事实显示待获取。
漏斗：先在远程按起点和筛选筛候选用户，再取所需类型、关联字段、窗口内事件。候选数量、事件行数、返回字节都有上限，超限异步或要求缩小范围，不静默截断。短期复用JS算法运行于worker，禁止在Express主线程处理大批事件；最终常用用户顺序漏斗迁移SQL。严格保持“首个起点、不可替换成更优起点”及待观察口径。
留存：首次事实确定cohort，用用户日事实JOIN回访日；成熟分母按as_of和完整覆盖确定。
分群：读取同版本28天特征；口径统一为已确认业务规则，原始模式历史策略种类与聚合28天策略种类差异必须在迁移前解决。
路径：session_id优先，缺失按用户30分钟拆会话，读取窗口边界上下文；后台worker处理限定范围，只返回聚合路径。截断/采样如开放必须明确标注，默认精确。
推荐/绑定：需要正式用户、关系和交易源。只有events不能补齐，缺失模块保持不可用。

## 实时和一致性

前端每15秒检查/api/analytics/status，页面隐藏暂停；同一页面同时最多一个请求，晚返回结果不能覆盖新筛选。有版本变化才拉当前页，轻卡片和重分析用不同刷新节奏，重分析不每15秒重复提交。恢复窗口立即检查，保留配置、图表视图和展开状态。

后端30秒生成源数据版本检查（共享，不能每个浏览器全表COUNT/MAX）。数据版本与数据截止时间分开；MAX(server_ts)本身不是严格版本或完整水位，可能漏同时间/历史修改。第一阶段按短时间桶失效+TTL保证重查；维护发布批次版本后按batch_version失效。事件数等状态由发布元数据提供。

一次指标与下钻绑定同一snapshot_id及数据集合；历史时间戳截止只能约束新事件，不能保证源表历史更新不可见。强一致版本需分析发布表/版本化数据；仅查询时截取as_of为弱一致，接口必须明确consistency。不虚构跨连接Hologres快照保证。

迟到数据：按server_ts及稳定辅助键捕获，短区间回读去重；重算受影响业务日和用户首次事实。首次事实变化可能影响后续留存/新回访，不能只修今天。近期业务日定期对账，更老迟到由显式历史修复发布新版本。真实完整覆盖需要上游保证；未知填null，不用末条时间当complete_through。

## 缓存、作业和保护

单实例先使用有界内存LRU：最多256项、总量64MB，默认TTL30秒，重分析结果60–120秒，闲置名单15分钟。缓存键包括query、snapshot、口径版本和权限范围。single-flight合并相同查询。多实例后才采用Redis共享缓存/作业队列，不要求首期部署。

初始pg.Pool最多8连接：6个交互、2个后台预算，总量需服从实例配额；连接等待最多2秒，简单查询超时3秒，复杂10秒，worker最长30秒。服务端SQL超时与真实取消必须验证，JS超时不能让数据库查询继续占用连接。重作业并发2、等待队列最多20，超限429/202而非无限排队。参数化SQL、白名单字段、只读账号和按账户限流。

下钻：数据库分页，不把全量名单载入Node再slice。用户列表稳定user_key游标，事件时间线用(event_time,event_id)复合游标，每页50/最多200；只返回必要字段。复杂分析名单优先远程结果表按job_id/snapshot_id保存，TTL清理；没有写权限时只允许有界结果缓存并在过期后明确要求重跑，不返回假空名单。

SQLite自动mock注入必须在remote模式禁用；现有后台SQLite连接模块改为应用状态用途，remote指标不依赖其events。credentials仅后端环境配置，迁移pg/dotenv为backend自身依赖。

## API及代码迁移

保持/api/metrics/*和/api/drill/*前端契约，增加meta：snapshot_id/as_of/source_seen_at/computed_at/freshness/coverage/consistency。/api/analytics/status提供data_version、last_success_at、last_error、mode。长请求202返回job_id，/api/analytics/jobs/:id返回状态和结果；结果轮询暂停/超时有明确提示。

新增backend/src/data/hologresPool.js、eventRepository.js、metricRepository.js、snapshotRepository.js；services/metrics负责口径与缓存；workers/analysis负责复杂算法。现有routes变薄，不直接散落SQL。frontend/main不再下载事实，dashboard切入聚合入口；现有raw模式仅开发或离线对账，不由100000条阈值自动决定生产模式。

配置ANALYTICS_STORAGE=hologres|sqlite控制切换，remote模式禁用seedMock及全量事件导入。保留原配置、账户和cohort；回滚模式仅显式手动切换，前端不能自动回退mock。

## 迁移和验收

阶段1：梳理字段、身份合并、来源和时间；记录远程表属性/权限及EXPLAIN；构造一百万事件隔离测试数据，含重复、迟到、匿名、无行为用户、跨日和缺关联ID。先迁移北极星、登录访问、时间线与状态刷新，建立remote模式。
阶段2：用户日/首次事实及发布批次；迁移漏斗/留存/分群/渠道，worker和游标下钻；保留相同快照对账。
阶段3：路径/推荐/交易事实接入，重分析结果TTL，限流监控，最终关闭本地事件复制。

所有阶段必须相同数据快照对比用户集合而非只比总数，覆盖37→35→24及25北极星的当前样本但不能将其当永久预期值。新增事件60秒目标内可见；去重不增人数，迟到能修历史，匿名不充作已登录访问；缺ID不伪造关联，快照内下钻名单与卡片一致。

性能在冷缓存/热缓存、7/30/90天范围、10并发用户下测P50/P95/P99、数据库扫描量、进程RSS及事件循环延迟。模拟Hologres断连、超时和队列满，保持旧数据显示且明确stale；持续运行24小时，验证本地无事件持久化增长、缓存有上限、作业名单清理。达不到目标先优化EXPLAIN和查询范围，再加预聚合，不能靠静默截断通过。

尚待确认：百万是累计还是日增、真实事件吞吐、Hologres资源/权限、源数据能否更新和删除、ID提交顺序、用户/推荐/交易事实来源及可承诺覆盖。

## 官方参考

Hologres索引与物理表设计：https://help.aliyun.com/en/hologres/getting-started/hologres-index-to-get-started-quickly
聚簇键限制：https://www.alibabacloud.com/help/en/hologres/user-guide/clustering-key
连接管理：https://help.aliyun.com/en/hologres/user-guide/manage-connections
事件时间裁剪：https://help.aliyun.com/en/hologres/user-guide/segment-key
