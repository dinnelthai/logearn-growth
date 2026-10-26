> 已被用户2026-10-26明确的业务口径修订：交易点击后以业务库交易事实为准，下面的前端授权/WS关联问题不再作为本任务阻断条件。

# Logearn Web → Growth 业务闭环复核 · 2026-10-26

## 结论

主干已接通，但尚不具备业务闭环完整性。不能仅凭7项友好路径测试或性能审计认定可以准确解释全部断点。先处理交易提交定义、长延迟交易关联和数据质量门禁，再补字段契约和断点目标复盘；最后进行真实采集验收。

## 检查版本与边界

- 已重新 fetch origin/master：422c0c2bb0de8ca996a1792abaa9519dd11b5d1a。
- 实际检查 PR #29 的最新 HEAD：54ac7df2195c6171aeac82f563e7c3259513edb4。相对6cc891db3只新增性能报告，业务代码相同。PR仍为OPEN，尚未合入master；不能由此推断是否另有预览部署。
- Growth：当前工作区中的标准事件投影、请求诊断、productChain、页面质量门禁、名单交接、运营任务创建/复盘。
- 只新增本地审查报告与复现脚本，没有修改产品代码、PR、运营任务或源库，没有发起真实订单或collect请求。

## 已接通的部分

- 主动分析发起与 success / empty / failed / cancelled 终态、缓存使用及失败重试引用均有实现。
- 请求ID独立于业务store；并发尝试及原Token/page访问上下文保留；结果没有切换到当前新页面。
- 手动交易WS状态只认既有业务确认；歧义的访问关联保留未知。
- Growth按用户、Token、链、访问ID及严格顺序关联，未成熟24小时窗口单列；同快照名单可以转到注册用户分群并生成固定任务。
- 原有7项回归在最新PR代码上通过，但未覆盖下列业务反例。

## 需要先修的三个问题

### P1 · “已提交交易”在授权/实际发单前就上报

位置：logearn-web-growth-instrumentation/src/components/ui/trade/full_modal/service.ts:302–327，批量入口:589–626；TEE helper:93–115。

swap_with_backend在调用TEE授权之前发trade_submitted。ensureTradingContext无授权、用户取消、签名失败时helper返回null，未执行operatePosition。限价单也会在attachLimitConditional返回false之前记录提交。批量入口同类。

本地执行真实swap函数、替换授权与订单API后复现：实际订单请求0次，Growth“提交交易”步骤1次。此时后续没有订单WS，取消/授权阻断和提交后失败都会混进“提交后未成功”。

验收条件：区分交易尝试、授权结果、真正的订单提交/受理及订单终态；取消授权不进入“真实已提交”。HTTP拒绝或网络异常也必须有明确尝试结果。不能为埋点增加交易请求、自动重试或改变TEE意图/签名契约。

### P1 · 5分钟内存关联支撑不了24小时交易观察

位置：logearn-web-growth-instrumentation/src/plugins/logearn_growth/state.ts:192–236；events/trade.ts:94–105；Growth backend/src/analytics/productChain.js:24–26。

产品尝试只保留在当前页面内存，匹配窗口5分钟且最多100条。Growth的转化窗口是24小时，但成功阶段必须有同一trade_attempt_id及token_visit_id。第6分钟到达的正常成功通知会发trade_succeeded，却没有尝试/访问关联；刷新或换标签页同样可能丢关联。

复现：第0分钟正常提交，第6分钟WS成功，仍在24小时窗内。事件成功终态存在，但Growth成功交易访问计0。

验收条件：用可核验的订单/请求关联保留提交时上下文，支持刷新、跨Tab和延迟确认；缺关联单列未知。单纯把“最近一次猜测”的TTL改成24小时会扩大歧义，不是完整修复。

### P1 · 质量门禁只检查详情版本，没有阻断已知的交易关联缺失

位置：Growth frontend/src/pages/productChain.js:5–6；backend/src/analytics/productChain.js:30。

页面只有在详情版本覆盖不完整时隐藏比例。所有详情都是新版时，即使交易成功事件明确缺访问/尝试关联，仍将该访问归入成熟断点并显示100%的“未观测下一步”。这在观测意义上有定义，但不能用于解释真实转化损失，且没有把已知关联不完整单列为未知。

上述6分钟反例同时复现：新版详情1/1，交易缺访问1条，页面仍显示100%未观测比例，而没有“采集待核对”门禁。

验收条件：请求/交易终态覆盖、孤立终态、冲突与关联缺失应进入分阶段质量判断。观察中、明确失败/取消、到期未观测和采集未知分别呈现；未知不作为可解释的业务断点比例分母或损失人数。

## 尚未闭合的两项业务能力

### P2 · 新had_cache字段没有到达dashboard

Web events/analysisRequests.ts:50新增had_cache，但Growth backend/src/data/behaviorPaths.js:5的字段白名单及frontend/src/analytics/trackingContract.json都没有它，请求诊断也无该维度。复现实际投影白名单后该字段消失。

因此当前只能看到cache_hit，无法在dashboard按新增的“曾有缓存但主动刷新”状态分析；还缺明确refresh/强制重取标记来区分刷新与其他缓存不使用情况。需统一事件契约、投影、派生事实指纹、诊断输出和页面，添加“有缓存且强制刷新”的跨仓库测试。

### P2 · 运营任务有执行闭环，但没有具体断点的目标恢复闭环

Growth backend/src/routes/operationTasks.js:57–62调用memberMetrics；frontend/src/pages/operationTaskDetail.js展示分析用户、分析次数、交易用户/笔数及金额。

可以固定名单、记录处理、继续观察，但不能直接回答“这批分析失败用户后续有多少次成功尝试”“提交后未成功的人是否得到订单结果”。创建任务时没有结构化保存原断点步骤、目标事件、质量前提及目标观察窗口；复盘没有恢复率/仍失败/未知。原统计期与任务后时长也不同，页面已正确提示不能直接相减为提升。

验收条件：给任务保存目标定义和分母，按固定名单输出目标恢复、未恢复、观察中及数据未知；普通使用汇总可继续保留，不能冒充该断点恢复率或因果增量。

## 采集与上线验收仍是独立门槛

transport.ts:63只认res.ok；pagehide在sendBeacon返回true后就释放本地批次。没有验证业务响应或按事件确认落库。用HTTP200但业务拒绝的本地响应替身，复现批次不保留且响应正文不读取。**这只是边界反例，不证明真实collector会返回该格式或发生这种拒绝**；需要先核实collector的正式ACK契约，再决定重试和确认规则。

只读到达核查：2026-10-25 00:00—2026-10-26 00:00（UTC+7）自然日窗口、查询截止2026-10-25T23:49:04.058Z，窗口已完整：

- Token详情598条：597条无版本、1条旧2026-10-16.v2版本。
- 交易提交1条、成功5条、失败3条，均无新版版本标记，均缺Token访问关联。
- 此窗口没有analysis_requested/analysis_request_finished到达，也没有web-core-chain-v1/web-analysis-v1样本。

这是原始到达聚合，不是统一身份后的去重报表，不证明代码未部署，也不证明线上完全没有使用；只能说明该窗口未提供新版链路验收样本。发布后仍需真实自然动作的event_id → collect HTTP/业务确认 → 原始到达 → 事实纳入 → 指标/名单对账，包含授权取消、延迟成功、刷新、重试、空结果等分支。

## 复现证据

output/business-completeness-2026-10-26/reproduce.cjs 使用最新产品真实函数/adapters及Growth计算/页面模块，全部API和collector为本地替身。reproductions.json记录五项反例/契约缺口，arrival-coverage.json记录只读到达聚合。没有生成生产埋点、真实订单或真实运营任务。
