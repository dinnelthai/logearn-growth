# Logearn Web → Growth 业务闭环复核 · 2026-10-26（按用户口径修订）

## 已确认的业务口径

用户明确：交易点击之后的行为不要求产品端追踪，交易结果从业务数据库读取。因此授权取消、WS通知是否到达、前端5分钟attempt匹配、刷新/换Tab后的通知关联，不再作为本次业务闭环的阻断条件，也不需要为了分析去改TEE或订单执行。

- logearn-web：采集真实浏览、Token访问、主动分析发起/结果，以及需要保留的交易点击/意图。
- Logearn-growth：交易人数、笔数及金额以业务交易表为准；缺少前端交易终态不表示没有交易。
- 行为与交易按已核验身份及真实时间窗口关联；若业务表没有token_visit_id等访问证据，不能宣称精确归因于同一次访问或某个按钮。

## 核对后仍需处理的事项

### P1 · 新productChain的交易数据源尚未采用业务库

backend/src/analytics/productChain.js:24–26仍从用户事件中找trade_submitted、trade_succeeded，并要求trade_attempt_id和token_visit_id。调用链是pathInsights → valueDiagnostics → productChain，没有注入交易业务事实。这不符合用户已明确的交易取数口径。

已有backend/src/data/memberMetrics.js的tradeSql/memberFacts确实读取public.trading_transaction，并复用tradeIdentityCte核验旧钱包身份到账号的映射。但这套业务事实尚未传入新productChain，不能因为其他报表查了交易表就认为本链路也已接入。

应让新链路消费业务库交易事实，使用真实具备的身份、时间、链/Token字段；明确查询失败、账号未匹配、字段不足、观察中与零交易。不要再把缺前端WS/attempt ID作为没有交易的证据。点击可保留为意图指标；点击之后无需增加前端生命周期事件。

### 已移出范围 · 性能检查字段

用户明确不需要本轮性能诊断。主动分析事件已移除had_cache、cache_hit、duration_ms；growth不再要求分析终态提供耗时，也不输出分析缓存维度、耗时记录或延迟统计。本项不再列为待接收/待修问题，缓存分支仍正常记录业务结果。

### P2 · 运营任务还缺按原业务目标复盘

现有任务能固定名单、保存基线和记录处理，但review只返回一般分析/交易汇总，未结构化保存原断点目标与恢复分母。

分析失败人群应复盘后续分析成功；分析后未交易人群应按业务交易表复盘后续真实交易，而不是等前端trade_succeeded。观察窗口、无法匹配身份和查询失败应单列；不同长度窗口不直接相减为提升，也不宣称因果增量。

## 分析侧采集与上线验收

主动分析请求的真实发起、success/empty/failed/cancelled、缓存、重试、并发和切页上下文仍需验证。transport只检查HTTP成功、pagehide只确认浏览器接受beacon；采集业务ACK及落库要按真实collector契约核实，不能把本地替身测试当线上成功。

检查版本：PR #29最新HEAD为54ac7df2195c6171aeac82f563e7c3259513edb4；master为422c0c2bb，PR当时仍OPEN。当前7项产品回归通过。10/25自然日到达聚合没有提供新版分析链路验收样本；这不证明代码未部署，但尚不足以确认新版采集通过。

## 本轮行为

本轮只检查、复现并修订报告，没有修改产品代码、PR、业务事实或运营任务。先前基于前端交易终态的复现保留在output/business-completeness-2026-10-26/作为历史技术证据；它们已不属于用户当前交易验收范围，不应据此要求新增交易点击后的埋点。
