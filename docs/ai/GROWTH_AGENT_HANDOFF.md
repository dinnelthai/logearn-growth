# Growth Agent 2.0 — Agent Handoff

> This is the first file a future Codex / ChatGPT Work / coding agent should read before continuing.

## 1. Current working branch

- Repository: `dinnelthai/logearn-growth`
- Required branch: `codex/ai-comprehensive-upgrade`
- Latest successful implementation/CI head: `c46073497ab41dfd67c44249e34d341b8063689e` (strict discriminating-query schema, source and period validation; CI run 41183309528 passed). Fetch the live branch before editing.
- Fetch the live branch HEAD before every new edit; do not rely on this document's historical commit reference.
- Latest successful CI: AI infrastructure run [41183309528](https://github.com/dinnelthai/logearn-growth/actions/runs/41183309528) — AI Contract, AI Frontend and AI Integration all passed.
- Checklist progress: 35 / 48 implementation items (73%); live-source acceptance is not included in that percentage.
- Do not switch to or commit to `master`.
- Do not merge or cherry-pick unrelated branch changes without a specific need.
- Always verify the branch HEAD before editing and fetch each target file from this branch.

The branch existed before this upgrade and already contained a substantial Growth Agent implementation. Do not rebuild the analytics, tool registry, evidence layer, Growth Workspace, KOL/SEO operations or review system.

## 2. Read these documents in order

1. `docs/ai/GROWTH_AGENT_HANDOFF.md` — this handoff.
2. `docs/ai/LOGEARN_BUSINESS_BRAIN.md` — canonical business semantics and v1 limits.
3. `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` — phases and acceptance criteria.
4. `docs/ai/GROWTH_AGENT_UPGRADE_LOG.md` — exact changes and validation performed.
5. `docs/ai/GROWTH_AGENT_ARCHITECTURE_PROPOSAL_2026-10-27.md` — earlier architectural decisions.
6. `docs/ai/growth-v1-baseline-2026-10-28.md` — earlier baseline limitations and real-source notes.
7. `docs/ai/GROWTH_MODULES_WORK_ACCEPTANCE_2026-10-29.md` — prior module acceptance boundary.

## 3. What is implemented in the current upgrade

Business Brain v1 runtime source:
- `backend/src/ai/business/businessBrain.js`

New model protocol:
- `backend/src/ai/business/modelTransport.js` — v5 transport and operating-memory projection.
- `backend/src/ai/business/weeklyContextV4.js` — optional reserved-byte support; legacy v4 default unchanged.
- `backend/src/data/productChainTrades.js` — trade lookups now start from successful same-token analysis windows; caps 5,000 windows / 20,000 rows and batches token enrichment in groups of 2,000.
- `backend/src/analytics/productChain.js` — exposes trade/window truncation as explicit quality coverage.
- `backend/src/workers/remoteAnalysis.js` — passes validated request-analysis rows into the trade lookup.
- `backend/src/ai/business/runner.js` — v5 marker, prompt rules, replay detection and bounded tool replies.
- `backend/src/queues/jobs/businessAnalysis.js` — new analyses opt into v5; archived tasks keep their stored prompt/transport.
- `backend/src/ai/growth/weeklyReport.js` — new v5 weekly prompt, including operating-layer and non-causal activity rules.
- `backend/src/ai/business/tools/operationsTimeline.js` — owner-scoped read-only operating timeline over existing activities, KOL collaborations, manual content, operation tasks, X/GSC/KOL observations and AI actions; includes aggregate delivery states and frozen settled outcomes only.
- `backend/src/ai/growth/weeklyCoverage.js` — 13th weekly module, with outcome-first aggregate facts and per-source coverage.
- Tests: `backend/test/aiBusinessBrain.test.js`, `aiWeeklyContextV4.test.js`, `aiWeeklyCoverage.test.js`, `operationsTimeline.test.js`, `operationsTimelineRegistry.test.js`, `aiWeeklyReport.test.js`.

New v5 flags:
- `AI_BUSINESS_BRAIN_V5_ENABLED` — defaults enabled when the existing v2/v3 context path is enabled; set to `0` to use the prior generic v3 context for newly created analyses.
- `AI_WEEKLY_CONTEXT_V5_ENABLED` — defaults enabled for new weekly reports; set to `0` to use the existing weekly v4 context.
- These flags do not rewrite archived jobs. The saved prompt marker chooses the recovery protocol.

## 4. Current v1 semantics

- Four products: AI Strategy, Chip Distribution, Holder Ranking, Wallet Trading.
- Seven lifecycle stages: acquisition, registration, activation, engagement, retention, trading, economics.
- Existing metric registry is the formal source of metric definitions.
- The North Star is stored as an operator direction, not a formal composite KPI.
- The model receives a bounded Business Brain and up to three compact historical AI suggestion/review entries.
- Operating Memory v1 now separates human operations, channel observations and AI suggestions/reviews. It reuses KOL collaborations, growth activities, manual content, operation tasks, X/GSC/KOL snapshots and AI action records. Community/training platforms still have no dedicated connector; unrecorded activity remains unknown.
- Business Brain does not grant tools or prove that every product behavior is instrumented.

## 5. Important pre-existing constraints

- Do not alter formal analytics SQL/metric definitions as a side effect of prompt changes.
- `new_users` means first observed analysis under the current metric contract, not new registration.
- `active_users` is not all login users or paying users.
- GSC/X/KOL observations do not prove downstream registration or incremental acquisition.
- Trade volume is not revenue. Use authoritative business trade facts for completed trades.
- Missing identity/visit association is unknown attribution, not zero trades.
- Mature retention cohorts only; immature is not churn.
- Unknown, not synced, not investigated, query failed and observed zero are distinct states.
- Correlation, adoption and simple before/after changes are not causal proof.
- Preserve owner isolation, aggregate-only model transport, paid-call journaling, 22KB budget and recovery safety.

## 6. Immediate next tasks

### P0 — Live-source acceptance (not yet performed)

- Validate the custom-period report and product-to-trade path against an already-authorized read-only Hologres source.
- Check operating timeline source freshness, per-source coverage, settled activity outcomes and query latency against real data.
- Do not call paid models, paid SEO research, or paid external collectors for acceptance. No live-source acceptance is implied by CI.

### P1 — Complete Growth Intelligence

- [x] Code-level source contract: product-to-trade reads authoritative trading_transaction facts and confirmed ledger / indexed swap token enrichment; identity, token and visit association remain separate.
- [x] Bound the trade query to successful same-token analysis windows and expose truncation / unknown coverage.
- [ ] Validate actual Hologres latency, trade match rate and identity coverage using the already-authorized read-only source.
- [ ] Finish the registration → activation → product engagement → trade source-contract review, including registered_users versus first-observed new_users and mature denominators.
  - Code review confirms separate mature registration → first-analysis (24h) and first-analysis → verified user-level trade (7d) cohort metrics. Growth Overview now requests these metrics explicitly; the unified product-engagement funnel and live-source contract remain open.
  - These three metrics now have formal shared definitions and are valid reviewed-learning focus metrics; Business Brain context remains within the 22KB budget in CI.
  - Deterministic triage recognizes the registration cohort rates as investigation signals while preserving the no-causal-claim rule.
  - The registration cohort also reports mature 7-day counts for chip analysis, Holder view, strategy start, signal view and repeat analysis. These are parallel overlapping entry metrics, not a forced sequential funnel.
- [ ] Review SEO/GSC PT date alignment, X snapshot freshness and KOL observation windows against live source watermarks.
- [ ] Add cross-channel activity links only when stable identifiers and comparable windows exist; temporal overlap is not attribution.

### P1 — Operating Memory

- [x] Build the initial owner-scoped timeline by reusing existing activity, KOL, content, task, X, GSC and AI action records.
- [x] Keep human activity, channel observation and AI action/review layers separate.
- [x] Include aggregate activity delivery state and frozen settled outcomes without member rows or IDs.
- [x] Expose per-source coverage, freshness limitations and truncated samples.
- [x] Distinguish X per-account available/empty/not-synced/unavailable/not-configured states and preserve them in the safe model projection.
- [x] Reuse owner-scoped `agent_changes` business notes as self-reported operating-memory timeline entries; keep note text bounded and treat it as untrusted, non-verified context.
- [x] Preserve stable references for existing CRM collaboration-to-activity links in the safe model projection; do not interpret these links as channel attribution.
- [x] Join KOL observation aggregates to CRM collaborations only by the shared CRM KOL profile ID; export aggregate behavior only and label the relation observational, not causal.
- [ ] Link campaign/content activity to channel metrics and mature outcomes where stable identifiers and windows allow.
- [ ] Validate operator-note freshness and model-safe text projection on the live read-only source.
- [ ] Add dedicated community/training connectors only if an existing source and business need are confirmed; do not infer absence from missing records.

### P2 — Decision Engine and Learning Loop

- Rank problems by business objective, impact, evidence strength and query cost.
- Produce competing hypotheses and the smallest authorized investigation that distinguishes them.
- Validate every proposed action's primary metric against the registry and retrospective service.
- Record execution and mature outcome using the existing workspace.
- Do not call an adopted suggestion successful until reviewed evidence supports it.

## 7. Validation / production boundary

This upgrade has not been deployed or tested against the user's live API/Worker. Latest AI infrastructure run [41175597697](https://github.com/dinnelthai/logearn-growth/actions/runs/41175597697) passed all three jobs: AI Contract groups 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112 (the aggregate harness reported zero failures); AI Integration 17/17; AI Frontend succeeded. This includes regression coverage for hashed CRM activity references, KOL collaboration joins, goal-ranked positive growth signals, impact-aware investigation focus, and competing hypotheses restricted to task-authorized tools. These are fixture/service-container checks, not a real-source acceptance test. Implementation code SHA verified by CI: `8d53c76ffe5ae33ab913ebb1a625d1690d5b8399`; subsequent commits in this handoff sequence update documentation only.

Do not:
- run paid model calls just to test projection;
- trigger paid SEO research or external data collection;
- change production databases or run migrations;
- deploy or publish externally;
- send messages or execute user-facing campaigns.

Ask for explicit approval before any of those actions.

## 8. Required update after every meaningful phase

Update:
- `docs/ai/GROWTH_AGENT_UPGRADE_LOG.md`
- `docs/ai/GROWTH_AGENT_HANDOFF.md`
- `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` (checkboxes and acceptance status)
- `docs/ai/LOGEARN_BUSINESS_BRAIN.md` when business semantics change.

Every handoff update must say:
- exact branch and HEAD;
- files changed;
- tests actually run and exact results;
- real-source / mocked / isolated status;
- known gaps and next task;
- whether a migration, paid call, deployment or external action occurred.

Decision Engine update (2026-10-31): v5 now ranks positive and negative signals by goal relevance and evidence quality, includes affected-population deltas only for user-count metrics, and selects authorized investigation candidates. Analysis output can include 2–3 competing root-cause hypotheses; query tools must be in the task capability set and hypothesis evidence IDs are checked against the owner-scoped store. Numeric query-cost ranking remains open because trusted cost/latency metadata is not currently available. Latest CI: run 41175597697 passed all three jobs. No live-source acceptance or deployment.


## 2026-10-31 — Action Engine / Learning Loop continuation

- Code work: structured action execution brief rendered into the existing `ai_suggestions.action` field; no migration. Exact duplicate action guard uses owner-scoped memory, metric and source scope.
- Learning policies now use `evidence-first-strategy-v4`, 30-day default validity, explicit goal/source scope, counter-evidence and rollback instructions. Expired/future/out-of-scope policies are ignored by the planner.
- Tests added: `growthActionWorkflow.test.js`, `analysisCompetingHypotheses.test.js`, `growthPlanner.test.js`, and `agentLearningLifecycle.test.js`.
- Known gaps: exact-text duplicate protection is not semantic; operation-task creation requires a fixed registered-user cohort cache and is not safe for generic recommendations; suggested observation days do not change the existing 3-business-day + watermark review gate; query-cost ranking remains unavailable without trusted cost/latency metadata.
- No migration, deployment, paid model call, paid data collection or external action. Continue by checking latest CI, then review whether a recommendation has a valid existing cohort cache before considering a link into operation tasks.


### Latest validation (2026-10-31)

- Run [41177009626](https://github.com/dinnelthai/logearn-growth/actions/runs/41177009626), head `55494b02cb9f4f298ad615f96fad069b1e15ac6a`: all AI Contract, AI Integration and AI Frontend jobs passed.
- Contract: 172 tests, 171 pass, 0 fail, 1 skipped; additional regression groups 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112. Integration: 17/17 with PostgreSQL/Redis containers. Frontend: success.
- Initial v3/v4 compatibility test failure was corrected: identical feedback digest no longer blocks writing a new strategy contract version.
- No live-source acceptance, migration, deployment, paid model call, paid collection or external action.


Final validation update: run [41177187712](https://github.com/dinnelthai/logearn-growth/actions/runs/41177187712), code head `27604c06ef103880350743723f5351c78d938d90`, passed all three jobs. Contract groups: 172 tests (171 pass, 0 fail, 1 skipped), plus 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112; Integration 17/17; Frontend success. No live-source acceptance or production/external action.


## 2026-10-31 — Accepted AI suggestion → operation task bridge

- Endpoints: `POST /suggestions/:id/link-operation-task` with `{ "taskId": "..." }`; `GET /suggestions/:id/operation-tasks`.
- Only owner-owned suggestions in `adopted`, `executing` or `executed` state may link. The operation task must already exist, belong to the same owner and have exactly the same source scope.
- Implementation reuses existing Growth Workspace problem and operation-link tables; no migration or new task/cohort generation.
- Problem detail now returns `linkedOperationTasks`.
- Tests cover acceptance gate, task existence, owner isolation, scope matching, idempotency and retrieval.
- Limitation: linking does not auto-transition the AI suggestion when the task is executed. Operator still records actual execution in the existing AI suggestion workflow. Automatic status sync and task baseline/after-evidence handoff into retrospective remain open.
- Latest successful CI: [41177929631](https://github.com/dinnelthai/logearn-growth/actions/runs/41177929631), code head `6a96a5c064a78ea08d9580260de18da9c3ffed6e`; all three AI jobs passed.


### Operation task execution synchronization (2026-10-31)

- PATCH `/operation-tasks/:id` (existing task route) now syncs linked suggestions after the SQLite task update: `in_progress` advances adopted suggestions to executing; `done` with a non-empty result note advances executing suggestions to executed, recording actual action and task completion time.
- Retry endpoint: `POST /operation-tasks/:id/sync-ai-suggestions`; reads the most recent task history note by default.
- Cross-database SQLite/PostgreSQL updates are not atomic. Response contains `suggestionSync.status` and per-suggestion results; retry partial failures explicitly. If optional workspace link tables are absent, this remains a no-op and does not break existing task updates.
- CI [41178355922](https://github.com/dinnelthai/logearn-growth/actions/runs/41178355922) passed all AI Contract, Integration and Frontend jobs at code head `1f0ab05f71b0fd5fef90b77282411102ebb3c5a2`.
- Still open: transfer the fixed-cohort operation-task baseline and after-period review evidence into the AI retrospective record. Current retrospective continues to use the existing business metric review service; no cohort-level causal claims.


## 2026-10-31 — Fixed-cohort retrospective evidence bridge

- New service: `backend/src/ai/growth/operationTaskEvidence.js`.
- The retrospective resolves the unique owner-scoped operation task linked to an executed AI suggestion. It revalidates source scope and exact equality of task completion time and suggestion executed_at.
- Requires exactly one linked task, task status `done`, a valid frozen audience (1–5,000 registered account IDs), complete source reads and a valid Hologres snapshot. Multiple links, mismatched scope/timestamp, missing links and incomplete reads are not silently treated as zero.
- Baseline window: 3–14 complete Bangkok business days ending before the operation task was created. Post-completion observation: the same number of complete business days beginning the day after task completion. The execution interval is excluded. Both windows are queried against the same Hologres snapshot and same fixed audience.
- Model projection includes aggregate metrics only (analysis users/events/days, trade users/transactions/volume, coverage and unmatched counts); member IDs and user-level rows are not included.
- `observeUntil` is retained in the cohort review periods. At least three complete post-completion business days are required. The AI prompt distinguishes this cohort evidence from whole-business/channel metrics and explicitly forbids causal claims from observational data.
- Retrospective persistence stores the cohort baseline, post-completion metrics, metric changes, snapshot and period anchors inside existing retrospective JSON fields; no schema migration.
- Tests: `operationTaskEvidence.test.js` covers equal-length windows, pre-task/post-completion anchors, maturity, owner isolation, execution timestamp match and source-scope drift. `operationTasks.test.js` covers task lifecycle sync.
- CI [41179371875](https://github.com/dinnelthai/logearn-growth/actions/runs/41179371875): Contract, Integration and Frontend all passed; dedicated task/evidence tests 10/10.
- Completed 2026-10-31: v2 observational outcome classification now feeds the owner-scoped learning index and next investigation planner; action-level anti-repeat protections are also in place. Live-source acceptance remains separate.


## 2026-10-31 — Fixed-cohort observational outcome learning

- Added `backend/src/ai/growth/retrospectiveOutcome.js` as the shared v2 observational outcome classifier.
- Corrected a versioning gap: the previous learning index and planner memory accepted only retrospective context v1, so the new v2 cohort payload could be persisted but ignored by subsequent learning. Learning now explicitly accepts v1 and v2; v2 never falls back to whole-business metric changes.
- Direct metric equivalence is intentionally narrow: `active_users → analysis_users`. This is a semantic match to the fixed cohort's observed analysis users. Other metrics such as `new_users`, `activation_rate`, `d7`, registered-user conversion and trade conversion remain `insufficient` until a valid cohort-level equivalent exists.
- A v2 outcome requires an available fixed cohort, equal requested audience sizes, zero unmatched accounts in both periods, and medium/high retrospective confidence. If the primary metric has no direct equivalent, or cohort evidence/coverage is incomplete, outcome is `insufficient`.
- Labels are `observed-supported`, `observed-contradicted`, or `insufficient`; evidence records the cohort metric, baseline/effect, audience count, periods and snapshot. Causal effectiveness and prediction accuracy remain null/not claimed.
- Updated `agentLearning.judgeHistory`, `experienceFeedback.summarizeExperience`, `agentStore.feedback` and `aiRecords.getAnalysisMemory`. The owner-scoped judgement store and next-investigation planner now receive v2 cohort evidence; the memory query explicitly projects both `baseline_data` and `effect_data`.
- Tests cover supported v2 outcome, incomplete coverage, unsupported metric, and planner experience feedback without fallback to global metrics.
- CI [41180112012](https://github.com/dinnelthai/logearn-growth/actions/runs/41180112012): Contract, Integration and Frontend all passed. Dedicated Learning/Experience cohort suite 24/24; AI Integration 17/17; Contract groups 174 (173 pass, 0 fail, 1 skipped), plus 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- No migration, deployment, production data collection, paid call or external action.


### Learning evidence visibility — 2026-10-31

- Growth Agent Control → “自我评价与下一轮策略” now displays the `insufficient` count alongside observed-supported and observed-contradicted.
- Added a clear explanation: these are fixed-cohort before/after observations, not causal impact; only directly comparable active-user evidence is currently eligible; unsupported metrics or incomplete coverage remain insufficient.
- Frontend UI workflow [41180322912](https://github.com/dinnelthai/logearn-growth/actions/runs/41180322912) passed.


### Learning evidence detail — 2026-10-31

- `GET /api/ai-analysis/growth-agent/learning` now returns the latest 10 owner-scoped observational judgements alongside aggregate counts and strategy versions.
- The response includes concise operation problem/action labels and evidence already present in the aggregate-only retrospective record; it does not expose cohort member IDs.
- Growth Agent Control renders a recent-review table: operation, metric, observational label, baseline → after value and fixed audience count. All dynamic text is escaped.
- AI infrastructure run [41180441759](https://github.com/dinnelthai/logearn-growth/actions/runs/41180441759) passed Contract, Integration and Frontend jobs. Frontend UI run [41180467339](https://github.com/dinnelthai/logearn-growth/actions/runs/41180467339) passed.


## 2026-10-31 — Action anti-repeat and insufficient-review handling

- `experienceFeedback.summarizeExperience` now retains up to three recent action-level lessons per metric, including bounded business problem, actual executed action, outcome label and reason. v2 reviews classified `insufficient` remain visible to the planner rather than disappearing from experience feedback.
- Planner skill checks receive prior action labels. An observed-contradicted action must not be repeated as-is; revisit only with a different hypothesis, mechanism and new evidence. An insufficient review requires evidence completion or a materially changed intervention and must not be treated as proof of failure.
- Investigation attention now weights contradicted reviews more strongly than insufficient reviews.
- `analysisContract.assertActionNovelty` now checks exact normalized action text against both the original proposal and the recorded actual executed action, scoped to primary metric and source. Similarity-based blocking is deliberately not used to avoid false positives.
- Tests cover contradicted-action prompt guidance, insufficient-evidence handling, and deterministic rejection of exact repeats of the actual executed action.
- Latest code CI run [41182874411](https://github.com/dinnelthai/logearn-growth/actions/runs/41182874411) completed successfully: AI Contract, AI Frontend and AI Integration all passed.
- No schema migration, deployment, paid call, production data collection or external write.


## 2026-10-31 — Reviewable metric and complete action-plan contract

- Added `backend/src/ai/growth/reviewMetrics.js` as the shared allowlist and value projection for the metrics the current retrospective job can actually reconstruct: `active_users`, `new_users`, `returning_users`, `activation_rate`, `d7`.
- The retrospective job now calls the shared `buildRetrospectiveValues`; the metric registry derives `reviewAdapter` from the same map and fails at module load if its declarations drift.
- Corrected a semantic mismatch: `registration_activation_rate` and `registered_trade_conversion_rate` were marked as growth-reviewable in the registry even though the retrospective job does not compute them. They remain valid business metrics, but are not eligible as new suggestion review metrics until direct retrospective reads are implemented. `registered_users` is likewise not currently reviewable.
- New analysis tasks pin `analysis-contract-v2` into the saved context. It requires directly reviewable primary/secondary metrics, a complete execution plan, impact and impact-basis fields, exact source scope, and bounded non-empty review conditions. Archived contexts without the marker keep legacy validation.
- Tests cover registry/service parity, retrospective value projection, unsupported metrics, malformed/duplicate metrics, required action plans, exact source scope and legacy recovery compatibility.
- CI [41182874411](https://github.com/dinnelthai/logearn-growth/actions/runs/41182874411) passed all three AI jobs. Contract groups: 177 (176 pass, 0 fail, 1 skipped), plus 26/26, 16/16, 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- No schema migration, deployment, live source collection, paid model call or external write.


## 2026-10-31 — Discriminating-query validation

- Strict `analysis-contract-v2` now requires competing root-cause explanations to be distinct and validates each discriminating query's input against the exact capability schema in the current task context.
- Query scope must match the task source; query dates must remain within the authorized period. `query_metrics` metric IDs are checked against the formal registry.
- The stricter input/schema validation is gated to v2 snapshots. Archived contexts retain the previous authorization behavior so older finalization/recovery is not retroactively broken.
- CI [41183309528](https://github.com/dinnelthai/logearn-growth/actions/runs/41183309528) passed all AI Contract, Frontend and Integration jobs. Contract groups: 177 (176 pass, 0 fail, 1 skipped), plus 26/26, 19/19, 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- Query-cost ranking remains open: legacy tool resource/latency costs are not measured. Do not label a query “cheapest” or invent cost estimates; prefer the smallest necessary authorized query and state cost as unknown.
