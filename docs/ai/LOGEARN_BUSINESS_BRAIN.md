# LogEarn Business Brain（业务知识体系）

> Runtime source: `backend/src/ai/business/businessBrain.js`  
> Current version: `logearn-business-brain-v1`  
> Status: v1 code added on `codex/ai-comprehensive-upgrade`; runtime / real-model validation pending.

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

The first implementation projects at most three compact entries from existing owner-scoped AI suggestion and retrospective history. It distinguishes:
- proposed action;
- actual recorded action;
- status (proposed / accepted / executing / executed / rejected);
- review outcome (effective / ineffective / unknown);
- primary validation metric;
- source scope and execution/review timestamps.

Important limitation: this is **not the complete operating history**. It does not yet cover all KOL, SEO, X, community, training-camp, campaign or manually executed work. Missing records do not mean no work happened. Phase 2/3 must connect those existing business objects rather than create duplicate operations systems.

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
- `backend/src/ai/growth/weeklyReport.js`: v3 weekly decision framing for new v5 reports; custom periods use a non-weekly v2/v3-derived prompt with explicit previous equal-length period semantics.

## 10. Known gaps

- North-star metric contract is not yet formalized.
- The runtime product map does not prove current event coverage for every product feature.
- The operating-memory input is AI suggestion/retrospective history, not a full operational activity timeline.
- Product-to-trade linkage and revenue completeness need real-source validation.
- This v1 has not yet been tested against the user's running API/Worker or a real paid model request.

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
