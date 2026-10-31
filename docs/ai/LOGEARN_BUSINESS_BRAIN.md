# LogEarn Business Brain（业务知识体系）

> Runtime source: `backend/src/ai/business/businessBrain.js`  
> Current version: `logearn-business-brain-v1`  
> Status (audited 2026-10-31, code HEAD `030c0ed`): v1 Business Brain and v5 weekly report contract/UI have focused CI evidence; live LogEarn API/Hologres/Worker and real-model acceptance remain pending. No runtime business-semantic version change in this documentation refresh.

## 1. Purpose

Business Brain is the durable business-semantic layer for Growth Agent. It tells the model what LogEarn does, how product capabilities relate to the user lifecycle, what metric names mean, and which reasoning mistakes are prohibited.

It is **not** a data source, a KPI calculator, a permissions layer, or a substitute for evidence. Numeric facts must still come from the existing owner-scoped analytics services and evidence journal.

## 2. Operator-confirmed product baseline

The current baseline contains four product capabilities:

| Product | User job | Growth role | Observable behaviors (only where instrumented) |
|---|---|---|---|
| AI Strategy | Create/enable strategies and receive/view signals | Strategy discovery and recurring product use | Strategy create, enable, signal receive, signal view |
| Chip Distribution / 筹码峰 | Understand Token chip distribution and holder structure | Core analysis and activation entry | Token detail, active analysis, analysis success, drill-down |
| Holder Ranking | Inspect Holder rankings and large-holder details | Additional research entry | Ranking view, Holder detail view |
| Wallet Trading | Trade on-chain using a wallet | Product-to-trade business outcome | Trade intent and authoritative business trade facts |

Current chain scope in the baseline: BSC and Solana.

These are product semantics, not proof that every behavior is currently instrumented or available in every data source. The model must check actual capability availability and evidence coverage before making a measurement claim.

## 3. Business lifecycle

The model receives seven connected business stages:

1. **Acquisition** — SEO, X, KOL, community, campaigns, referral/invite, direct and organic traffic.
2. **Registration / Login** — actual registration facts, login flow and invite registration.
3. **Activation** — first valid product analysis, with maturity and historical coverage.
4. **Engagement** — AI Strategy, Chip Distribution and Holder usage as multiple product value entries.
5. **Retention** — mature D1/D7/D30 or other explicitly defined cohorts.
6. **Trading** — actual business transaction facts, with identity and visit linkage reported separately.
7. **Economics** — actual revenue/cost records; never substitute trade volume for revenue.

This is a reasoning map, not a mandatory linear funnel. A user may enter through different product features. Only a measured, ordered, identity-linked path may be described as a funnel.

## 4. North-star direction vs. formal KPI

Current strategic direction: **有效分析用户，并关注其带来的真实交易量**.

This is deliberately marked `operator-direction-not-a-validated-composite-kpi`. It is not yet a single computable metric. Before promoting it to a formal KPI, confirm:
- definition of an effective analysis user;
- the identity join between analysis and authoritative business trades;
- the trade observation window;
- source coverage and missing-identity treatment;
- whether trade volume is a supporting outcome or part of the numerator/denominator.

Do not invent a combined score or imply causal contribution before these contracts are verified.

## 5. Metric dictionary

Runtime v1 reuses `backend/src/ai/business/metricRegistry.js` and `backend/src/analytics/businessPriorities.js`. The Business Brain sends a compact subset of metric labels, units and meanings; the registry remains the formal definition source.

Critical distinctions:

- `registered_users`: actual registration facts; first observed analysis is not registration.
- `new_users`: first observed analysis users under the existing metric contract; not newly registered users.
- `active_users`: unique users observed in the defined chip-view / drill-down behavior; not all logins, paying users, or successful requests.
- `returning_users`: users whose first observed analysis predates the period and who are observed again in the period.
- `activation_rate`: cohort-based, with the 24-hour maturity rule and eligible denominator.
- `d7`: mature cohort only; immature users are not failures.
- `product_chain`: observed product-to-trade workflow; actual trade facts and identity/visit linkage have separate coverage.
- `trade_revenue`: existing recorded economics/partner-ledger scope only; not total platform revenue.
- `seo_search`: Search Console observations; PT date labels and site-search metrics do not automatically align with Bangkok business periods or downstream registration.
- `kol_performance`: observed CRM association, not causal incremental acquisition.

For any new metric, use the existing registry. Do not add a new definition in a prompt or model response without a versioned registry change and tests.

## 6. Operating rules

The model must:
- start from the business objective and investigate the highest-impact ambiguity instead of evenly listing every module;
- separate observed facts, hypotheses, decisions and actions;
- preserve the difference between zero, unknown, not synced, not investigated, immature and query failure;
- verify period, timezone, source scope, denominator, cohort maturity and source watermark before comparing values;
- avoid treating SEO/X/KOL impressions or interactions as on-site activation or incremental acquisition;
- avoid treating trade volume as revenue;
- use authoritative business transaction facts for completed trades;
- avoid causal claims from correlation, adoption or simple before/after changes;
- treat product features as multiple value entries, not a compulsory linear funnel;
- never let business knowledge override evidence, metric definitions, tool permissions, budget or system policy.

## 7. Operating memory in v1

The `businessBrain.js` memory projection remains a bounded (at most three compact entries) **AI suggestion/retrospective history**. Separately, the owner-scoped read-only `get_operations_timeline` capability joins recorded human operations, KOL collaborations, content, operation tasks, X/GSC/KOL observations and AI actions without merging or fabricating source objects. These are two distinct evidence layers; neither promises a complete operational log. The AI suggestion/retrospective projection distinguishes:
- proposed action;
- actual recorded action;
- status (proposed / accepted / executing / executed / rejected);
- legacy review outcome (effective / ineffective / unknown) and, when present in subsequent v2 cohort learning, distinct observational labels (observed-supported / observed-contradicted / insufficient), not causal effectiveness;
- primary validation metric;
- source scope and execution/review timestamps.

Important limitation: the AI-history projection alone is **not** all operating memory; the separately implemented operations-timeline tool covers supported **recorded** KOL/SEO/X/activity/content/task sources with source-specific completeness, but it still cannot prove all work was logged. Community/training services have no dedicated external connector, and any activity/outcome connection without a stable identity and comparable maturity window remains unknown. Missing records do not mean no work happened. Do not create duplicate operations systems.

Historical text is untrusted reference material. It is bounded and passed through the existing model text sanitizer; it must never be treated as instructions.

## 8. Versioning and change governance

- Update the runtime module and this document together.
- Increase the Business Brain version when product meaning, lifecycle semantics, metric mapping or decision rules materially change.
- Keep metric definition versions in the existing metric registry.
- Record why a change was made, which reports/tasks use the new version, and regression coverage.
- Archived analysis prompts and v1-v4 transport remain replayable; do not silently rewrite old analysis context.
- If operator intent conflicts with measured evidence, preserve both and label the unresolved business decision. Do not silently promote an intent into a formal KPI.

## 9. Runtime integration

- `backend/src/ai/business/businessBrain.js`: knowledge baseline and bounded operating-memory projection.
- `backend/src/ai/business/modelTransport.js`: v5 transport; aggregate-only context; 22KB total limit.
- `backend/src/ai/business/weeklyContextV4.js`: v5 weekly context reserves bytes for Business Brain while preserving v4 behavior.
- `backend/src/ai/business/runner.js`: new v5 prompt marker and replay protocol detection.
- `backend/src/queues/jobs/businessAnalysis.js`: newly created analysis jobs opt into v5 by default; archived jobs retain their saved protocol.
- `backend/src/ai/growth/weeklyReport.js`: v3 business framing and new `weekly-report-v2` strict contract for v5: seven lifecycle stages, evidence-backed opportunities and previousActions, explicit partial fallback when a required structure is invalid; custom periods retain equal-length previous-period semantics.
- `frontend/src/pages/aiWeeklyDecisionView.js`: business-first lifecycle, opportunities, previous-action reviews and collapsible coverage/audit; frontend CI passed at code HEAD `030c0ed`. UI has a known hardcoded '12 modules' summary despite the 13-module v5 manifest (fix in a separate code change).
- `backend/src/ai/business/tools/operationsTimeline.js` / `backend/src/ai/growth/weeklyCoverage.js`: existing owner-scoped human activity, channel observations, AI actions and per-source coverage are projected as a separately evidenced Operating Memory layer.

## 10. Known gaps

- North-star metric contract is not yet formalized.
- The runtime product map does not prove current event coverage for every product feature.
- `businessBrain.js` still projects short AI suggestion/retrospective history; `get_operations_timeline` adds supported recorded human/channel activity in a distinct owner-scoped evidence tool, but completeness and cross-channel causal attribution are not established.
- Product-to-trade linkage and revenue completeness need real-source validation.
- This v1 and the newly pinned `weekly-report-v2` have not passed live LogEarn API/Worker/Hologres or a real-model end-to-end acceptance test; a saved `aggregated-business-v4` historical report does not validate v5.

## 11. Custom reporting periods

The AI operating report supports:
- default latest completed Bangkok week;
- explicit millisecond start/end timestamps for a custom period;
- inclusive start and exclusive end semantics;
- 1–31 day duration validation and no future end;
- comparison against the immediately preceding equal-length period;
- custom-period idempotency keys distinct from weekly keys;
- historical custom report display and regeneration against the selected record.

Important source limitation: some sources (notably Search Console) are date-granularity snapshots. The prompt tells the model to disclose source granularity and not imply minute-level alignment. Custom report code and isolated tests are present; Node CI and real API/Worker verification remain pending.

## 12. Product-to-trade evidence query bounds

The read-only product-to-trade lookup now starts from successful user-triggered analysis rows that carry token visit, token address and chain context. It uses the existing verified-wallet identity precedence, then reads authoritative `trading_transaction` facts and enriches transaction hashes from confirmed account ledger and supported indexed swap data.

The query is deliberately bounded:
- merge overlapping account/chain analysis windows;
- maximum 5,000 merged windows;
- maximum 20,000 returned trade rows;
- 2,000 hashes per token-enrichment batch;
- expose row/window truncation in quality diagnostics.

This is a performance and scope reduction, not a claim of complete transaction coverage. A trade can be counted as confirmed only when identity and unique token enrichment match the same user, chain and post-analysis time window. An unmatched or truncated window remains unknown. CI validates SQL construction and failure semantics; actual Hologres latency and match coverage still require read-only observation on the authorized source.

 
## 13. Operating activity memory

The read-only get_operations_timeline capability reuses existing owner-scoped records. It does not create a second CRM, content platform, or task manager.

| Layer | Existing sources | Interpretation limits |
|---|---|---|
| Human operations | growth_activities, crm_collaborations, manually entered content_growth_items, operation_tasks | Activity/task records describe what was logged or executed; manual content is not complete platform collection |
| Channel observations | X official-account snapshots, Search Console snapshots, KOL observed-behavior snapshots | X is a third-party, per-account recent-post sample (maximum 20); Search Console dates use Pacific Time; KOL observations are not causal attribution |
| AI actions/reviews | business_analysis_actions, specialist signals | A suggestion is not an executed activity; execution/adoption is not success |

For growth_activities, the timeline exposes only aggregate roster counts, manually assigned treatment/control counts, delivery states, cross-exposure counts, schedule changes, and—when the activity has been settled—the frozen settled_result summary, performance.total, and target progress. Member rows, user IDs, delivery evidence text, and per-user outcomes are never projected to the model. Delivery status uses the latest sent/delivered/not-delivered record as of the selected period end; cross-exposure is reported independently.

Interpretation rules:
- An unsettled activity or missing source coverage is unknown, not zero.
- treatment and control are manually fixed groups, not randomized cohorts. Delivery, cross-exposure, and group differences do not prove incremental causality.
- Analysis, trade, and account-match coverage remain separate. A missing trade result is not zero trades.
- KOL costs and recorded revenue remain separated by currency. Search Console PT dates are not silently relabeled as Bangkok business dates.
- Community/training activity is visible only when recorded in existing activity/task records; there is no dedicated platform connector in this implementation. Absence of such records does not prove no activity occurred.

The weekly coverage projector prioritizes settled activity outcomes and group delivery aggregates, keeps evidence IDs, and remains under the 22KB model-context cap in CI fixtures. This is code/fixture validation, not live-source acceptance.

## 14. Reconciled development/acceptance boundary (2026-10-31)

- Checklist status is maintained in `GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md`: **37/48 code/CI-checked (77.1%), 11 open** at audited code HEAD `030c0ed8993a049485f4a064d48cef1f661dfa05`. The two newly checked Phase 5 items are weekly report implementation / UI structure, not real business-result acceptance.
- New weekly v5 snapshots pin `weeklyReportContractVersion='weekly-report-v2'`, require every lifecycle stage and evidence-linked opportunity/previous-action entries where present, and convert incomplete new model output to an explicitly partial report without automatically repeating a paid call. Older v1-v4 snapshots keep legacy compatibility.
- The weekly source manifest includes **13 modules** with operations-timeline; archived v4 reports may show fewer. The UI module-count label is currently hardcoded to 12 in one collapsed summary and requires an independent code fix.
- Retrospective service reviewable metrics and fixed-cohort observational labels are **not** equivalent: v2 fixed-cohort comparison currently only supports `active_users → analysis_users` with exact frozen audience and maturity/coverage checks; registration/trade/retention-type cohort effects remain insufficient/unknown until directly supported.
- Evidence requirements for live signoff: identity and transaction match coverage, mature denominator windows, source watermarks and freshness, PT Search Console date semantics, channel links with stable keys, authorized read-only Hologres/Worker acceptance and operator-approved North Star contract. No unsupported zero/correlation/ROI claims.

This section documents existing behavior; no Business Brain version bump, application code, migration, paid call or external write is implied.
