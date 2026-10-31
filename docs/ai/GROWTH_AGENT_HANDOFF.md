# Growth Agent 2.0 — Agent Handoff

### 2026-10-31 — Structure/function review remediations (branch-only; no paid production validation)

- **Code commits:** `de35592f92437454663fb1c453047cfde2ea2b19` (paid preflight), `20ba691da469c776a3b92bac2633fa41ffd4e214` (v5 evidence/weekly ordering), `76f5c1566b5b0202f54aa07efddf9cc24e891c21` (decision-first UI).
- **Token budget:** The runner stops *new* paid rounds before the provider/ledger when estimated input plus reserved output exceeds the task's remaining token allowance. Already-paid overruns retain their response, warning and ledger; no subsequent paid round. A provider's actual token usage may still exceed requested output caps, so this is not a hard provider-side guarantee.
- **Autonomous paid analyses:** the scheduler now defaults to a signal preflight, and paid-enabled deployment configuration rejects `AI_AUTONOMY_SIGNAL_GATE_ENABLED=0`. Unreliable/missing metric sources defer rather than dispatch paid work.
- **Model source facts:** new `weekly-report-v2` manifests promote collected→analyzed only when a factual claim matches the cited aggregate field path and exact numeric value. The prompt specifies `values[].path`; archived v4 reports retain their original semantics. Goal- and trustworthy question-driven prioritization adjusts prefetch order without increasing its 10-query cap or granting permissions.
- **Operator report:** headline highlights the top evidence-verified risk. An immediate action appears only when the saved action explicitly cites at least one of that risk's evidence IDs; otherwise the UI asks for evidence review.
- **CI:** AI infrastructure workflows for `de35592f` ([run 41210895328](https://github.com/dinnelthai/logearn-growth/actions/runs/41210895328)) and `20ba691d` ([run 41211012875](https://github.com/dinnelthai/logearn-growth/actions/runs/41211012875)) passed. Frontend UI for `76f5c156` has a separate workflow; verify its result at that exact SHA before approval.
- **Unresolved acceptance:** actual already-authorized v5 context + live source/journal/Worker/ledger, click-event coverage, GSC/X/KOL watermarks, real trade identity/fees, and fixed-cohort reviews beyond the semantically equivalent `active_users` must be checked in the real environment. This work does **not** change the 47/48 (97.9%) code/CI checklist to 48/48.
- **No unsafe cleanup:** tracked `backend_副本`, archives and historic `output` were not deleted without evidence that no deployment/retention process depends on them. Legacy transport splits should wait for a tested compatibility migration.
- No paid model calls, live external collectors, migrations, deployments, outward publishing or `master` changes were authorized/performed in this patch set.


### 2026-10-31 — Code Review fixes and CI (branch-only, no paid validation)

- **Source/test HEAD:** `5c3f8dbbc7e234eac26e3763ef24ae692b6e3009` (P1 fix commit `acd5105fa79f82cc0806ef1425a668199a3144b4`).
- **CP-12 regression fix:** `frontend/src/analytics/funnel.js` now calculates the terminal transition's mature `drop_off_users` instead of unconditionally returning zero. Pending observations and incomplete association IDs stay outside confirmed loss. The additional terminal-step regression is included.
- **CP-05/09 contract alignment:** New v5 natural-week and custom-period prompts reference **13 modules**, while archived v4 prompts keep historical 12-module wording. The operator-confirmed `active_users` unique chip-view definition is now distinguished explicitly from **unverified live event coverage and cross-device identity**.
- **CP-09 frontend decision:** the risk panel prefers the pinned owner-scoped `growthPlan.questionRanking`; when unavailable, confirmed North Star `active_users` is ahead of supporting `new_users`. A trusted snapshot change requires *both* period-matched numeric evidence IDs; an incomplete comparison shows the snapshot with an explicit caveat and **no risk trend**. Existing historical data is not rewritten.
- **CP-08/09 Learning Loop:** contradictory v2 model-vs-fixed-cohort directions retain `assessment=insufficient`, but now carry `judgementConflict=true`, observed direction and a distinct reason into judgements and planner lessons. No causal claims or new review metrics were added.
- **Validation:** [AI infrastructure #41209778423](https://github.com/dinnelthai/logearn-growth/actions/runs/41209778423) and [Growth desktop UI #41209778387](https://github.com/dinnelthai/logearn-growth/actions/runs/41209778387) **passed** on P1 source/test commit `acd5105`. [AI infrastructure #41209843200](https://github.com/dinnelthai/logearn-growth/actions/runs/41209843200) **passed Contract, Integration and Frontend** on final code/test commit `5c3f8db`. The full desktop UI workflow did not rerun on the backend-only follow-up; it had passed on the unchanged frontend source `acd5105`.
- **Progress stays 47/48 (97.9%) code/CI, 1 real-source gate open.** This fixes code/regressions, **not** live LogEarn Hologres, GSC/X/KOL, saved v5 model-journal, Worker execution, cost ledger, actual click coverage or CP-01..12 production acceptance. Do not mark any production CP as PASS from CI alone.
- No paid AI/model calls, external collectors, data migrations, production deployment, external posting or `master` changes in these commits.


> This is the first file a future Codex / ChatGPT Work / coding agent should read before continuing.

## 1. Current working branch

- Repository: `dinnelthai/logearn-growth`
- Required branch: `codex/ai-comprehensive-upgrade`
- Latest **source/test** HEAD validated on 2026-10-31: `384c02c462acb59b3a3316bec54a18fabca28e7e` (owner-scoped GET-only archived v5 snapshot audit, safe historical-v4 denial, UI affordance, no-paid regression). Fetch live branch HEAD before every edit.
- Fetch the live branch HEAD before every new edit; do not rely on this document's historical commit reference.
- Latest successful AI CI: [41207439675](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439675) — **AI Contract (including archived v5 audit API and privacy), AI Integration and AI Frontend passed** on source/test HEAD `384c02c462acb59b3a3316bec54a18fabca28e7e`. Includes persisted owner-scoped latency and ranking/discriminator privacy regression. No live Hologres, X, GSC, Worker, real-model or paid-model acceptance implied.
- Latest canonical checklist: **47 / 48 (97.9%) code/CI or operator-approved semantics; 1 open**, Phase 2 **8/8**, Phase 3 **8/8**, Phase 4 **6/6**. Remaining: already-authorized genuine v5 business context/source acceptance; operator North Star definition confirmed 2026-10-31. CI is not live source acceptance.
- **Current continuation (post-`5b957a1`):** `backend/src/ai/business/savedContextAudit.js`, `backend/scripts/auditSavedWeeklyContext.js`, `backend/test/aiSavedContextAudit.test.js` and `docs/ai/GROWTH_V5_SAVED_CONTEXT_AUDIT.md` add an offline, non-paying *saved v5 snapshot* audit. **Not** live source or paid-model acceptance. A current local browser view displays an archived `aggregated-business-v4` report with 12 modules, not new v5. Recheck branch HEAD and CI after this documentation commit.
- **CI inclusion:** The offline saved-context audit test is explicitly included in the AI Contract GitHub workflow (`backend/test/aiSavedContextAudit.test.js`). Check the workflow run on the exact newest SHA before calling it green.
- **Operator signoff recorded 2026-10-31:** North Star is single `active_users` unique Chip Distribution viewers in a reporting period, not a composite. Trades are separate outcomes without a new North Star attribution window; unmatched identity is a verified-linkage exclusion and quality anomaly. User confirmed counting rules; click event fidelity remains a source-validation task.
- Do not switch to or commit to `master`.
- Do not merge or cherry-pick unrelated branch changes without a specific need.
- Always verify the branch HEAD before editing and fetch each target file from this branch.

The branch existed before this upgrade and already contained a substantial Growth Agent implementation. Do not rebuild the analytics, tool registry, evidence layer, Growth Workspace, KOL/SEO operations or review system.

## Operator-confirmed North Star (2026-10-31)

- `active_users` is the single primary North Star: observed `chip_analysis_viewed` or `chip_analysis_drilldown`, count distinct `user_key` for the selected reporting period; N views by the same key count one user. A successful analysis result is not required.
- This event union is the current tracking *proxy* for clicking/opening Chip Distribution, not independently verified complete click coverage or stable cross-device identity.
- Trading is a separate outcome, not part of the North Star. The operator does not define a North Star analysis-to-trade window. Keep the independently defined historical `registered_trade_conversion_rate` seven-day metric separate.
- Transactions with unmatchable identity are excluded from verified user-linked trading but must be flagged as matching anomalies/unknown coverage; never equate these with zero actual trades.
- Operator decision closes the semantic signoff checkbox only. Authentic v5 context and source acceptance is the remaining gate. Follow `GROWTH_V5_SAVED_CONTEXT_AUDIT.md` without unnecessary paid calls.
## Latest no-paid acceptance continuation (2026-10-31)

- `GET /ai-weekly-reports/:id/snapshot-audit` in `backend/src/routes/growthWorkspace.js` reads only owner-matched persisted weekly AI records, returns a boolean-only snapshot audit. The existing router is mounted behind application auth. No paid call, queue, source sync, DB write or migration.
- `frontend/src/pages/aiWeeklyReportPanel.js` adds **检查 v5 快照（只读）** next to existing archived-report controls. The response indicates saved `weekly-report-v2` / 13-module shape readiness only. It NEVER claims live source correctness or original v5 prompt/model proof.
- Backend focused regression: `backend/test/aiWeeklySnapshotAuditHttp.test.js`; frontend focused regression: `frontend/src/pages/__tests__/aiWeeklySnapshotAudit.test.js`; both included in AI infrastructure workflow.
- **Pass:** [AI CI 41207439675](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439675) all three jobs. **Separate failure:** [full Frontend UI 41207439672](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439672), unrelated unchanged funnelAssociation test (`drop_off_users` mismatch). Do not report all CI green.
- **Last unchecked roadmap item remains unchanged:** already-authorized genuine v5 context with real source watermarks and original journal/protocol confirmation. Selected local app still shows archived v4 (12 modules); no live v5 verification conducted. No `master` change or paid model operation.
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
- `backend/src/ai/growth/weeklyReport.js` — v5 `weekly-report-v2` contract: seven lifecycle stages, evidence-backed growth opportunities and previous-action reviews; strict validation and explicitly partial fallback rather than automatic paid retry.
- `backend/src/ai/business/tools/operationsTimeline.js` — owner-scoped read-only operating timeline over existing activities, KOL collaborations, manual content, operation tasks, X/GSC/KOL observations and AI actions; includes aggregate delivery states and frozen settled outcomes only.
- `backend/src/ai/growth/weeklyCoverage.js` — 13th weekly module, with outcome-first aggregate facts and per-source coverage.
- `frontend/src/pages/aiWeeklyDecisionView.js` — lifecycle, positive opportunities, operating-memory reviews, and collapsed technical/coverage sections. Legacy 12-module saved reports remain 12; new manifests are 13, and the current UI reads the persisted manifest count.
- `backend/src/queues/jobs/businessAnalysis.js` — new v5 weekly snapshots pin `weeklyReportContractVersion='weekly-report-v2'`; archived v1-v4 reports remain replayable and may not display the new report sections.
- Tests: `backend/test/aiBusinessBrain.test.js`, `aiWeeklyContextV4.test.js`, `aiWeeklyCoverage.test.js`, `operationsTimeline.test.js`, `operationsTimelineRegistry.test.js`, `aiWeeklyReport.test.js`, `frontend/src/pages/__tests__/aiWeeklyDecisionView.test.js`.

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

### P0 — Live-source acceptance (not yet performed; do not infer from checked Phase 5)

- Validate the custom-period report, v5 13-module coverage, registration-to-engagement-to-trade path and product-to-trade matching against an already-authorized read-only Hologres source. Check actual v5 context/report schema without unnecessary paid model calls; viewing an archived v4 report is not a new-v5 test.
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

- Existing code ranks by goal relevance, observed magnitude and evidence strength and validates competing hypotheses against authorized capability schemas, source and date scope; **numeric cheapest-query/cost ranking is still unimplemented** without trusted tool latency/resource metadata.
- The `analysis-contract-v2` enforces only reviewable metrics and a complete execution plan; exact action duplicates are rejected, but semantic-equivalent actions are not automatically blocked.
- Suggested actions can link to an existing owner-scoped fixed-cohort operation task, execution status can sync, and observational outcome can feed planner memory. **Live end-to-end fixed-cohort acceptance is open**.
- The existing retrospective service can read `active_users`, `new_users`, `returning_users`, `activation_rate`, `d7`; the **fixed-cohort v2 classifier only directly compares `active_users → analysis_users`**. Other primary metrics remain `insufficient` until directly comparable cohort evidence exists.
- Do not call an adopted suggestion successful until mature evidence supports an observational label; never claim causal impact from a simple before/after comparison.

## 7. Validation / production boundary

This upgrade has **not** been deployed or accepted end-to-end against the user's live API, Hologres, Worker or an actual paid model request. The latest audit-confirmed AI CI is [41184069508](https://github.com/dinnelthai/logearn-growth/actions/runs/41184069508) (success on `76ec311df688860f93b72b930641cf1c3cd3ef03`); exact code HEAD UI CI [41184123727](https://github.com/dinnelthai/logearn-growth/actions/runs/41184123727) passed on `030c0ed8993a049485f4a064d48cef1f661dfa05`. Intermediate failed runs were followed by corrective commits; do not infer all historical runs passed. CI uses fixtures or service containers, not live business-source acceptance. No paid model call, production migration, deployment, or external write was authorized in this documentation reconciliation.

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

## 2026-10-31 — Reconciled progress handoff (documentation-only)

- Audited source code HEAD: `030c0ed8993a049485f4a064d48cef1f661dfa05`; update/verify actual branch ref before any further work.
- Canonical roadmap: `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` now records **37/48 code/CI checked, 11 open**; phase allocation: 0=5/5, 1=8/10, 2=2/8, 3=7/8, 4=4/6, 5=5/5, 6=6/6.
- What changed in completion accounting: two Phase 5 items for business-first lifecycle/opportunity/previous-action report and collapsible source/audit UI have actual implementation, strict schema tests and successful CI. This was a **documentation status update**, not a new code feature or live source test.
- Priority unresolved roadmap work: Phase 2 source contracts (6 items), Phase 1 real-v5 context verification and operator North Star review (2), Phase 3 stable activity/outcome linkage (1), Phase 4 numeric query-cost ranking and discriminating-query cost choice (2).
- Outside checkbox count: confirm new v5 report output with authorized sources, real Hologres trade matching/latency, genuine mature fixed-cohort review and owner-scoped Operating Memory freshness. Fix hardcoded “12 modules” UI label against the v5 13-module manifest when code editing is authorized.
- The last saved report viewed in the browser was `aggregated-business-v4`; **do not use that archived report** to assert new v5 weekly contract production acceptance.
- No application code, database, deployment, paid model, paid collector or external campaigns changed during the documentation pass; GitHub documentation updates only.

## 2026-10-31 — Phase 2 evidence-contract continuation (code + CI)

- **Source/test HEAD:** `f9de3abb5eae27be99ba9129ee92c8b57a318a03`, branch `codex/ai-comprehensive-upgrade`. Follow-up documentation commits are not feature completion.
- **Backend:** `backend/src/ai/business/tools/adapters.js` adds conservative per-metric `coverage.status/reason` for registration count, 24-hour mature registration activation and 7-day user-level real-trade conversion. `backend/src/ai/business/tools/registry.js` now retains `query_metrics` metric warnings (previously overwritten by shared warning list) and per-metric coverage. The events snapshot is not falsely used as a registration-specific watermark; registration/trade source watermarks remain explicitly unknown until validated.
- **Tests:** `backend/test/agentTools.test.js` covers end-to-end owner-scoped immutable evidence fields including the observed zero vs null distinction, independent coverage, warnings, requested source, definition version and watermarks. `backend/test/aiBusinessMetricsAdapter.test.js` checks registration/activation/trade availability separately. AI infrastructure [41184881554](https://github.com/dinnelthai/logearn-growth/actions/runs/41184881554) passed its Contract, Integration and Frontend jobs.
- **Frontend:** `frontend/src/pages/aiWeeklyCoverageView.js` preserves historical 12 modules while allowing bounded extra modules declared by the saved `weekly-coverage-v1` manifest (currently the 13th operations timeline). `frontend/src/pages/aiWeeklyDecisionView.js` calculates the visible label from the actual summary. `frontend/src/pages/__tests__/aiWeeklyDecisionView.test.js` covers 12/13 compatibility; desktop UI [41184785074](https://github.com/dinnelthai/logearn-growth/actions/runs/41184785074) passed.
- **Roadmap accounting:** partial progress within Phase 2 source contract, not completion of the broad per-source metadata checkbox; **37/48 (77.1%) remains unchanged**, Phase 2 **2/8**, **11 remaining**. Do not claim source freshness is proven by `snapshot.as_of`; registration/trade watermarks have no independent measurement yet. Next work should cover all other module types, historical data coverage and read-only real Hologres reconciliation.
- **Boundary:** no live LogEarn data read, paid model call, database migration, external collection, deployment or campaign write during this code/CI documentation update.

## 2026-10-31 — Business Brain v2 financial provenance handoff

- **Source/test SHA**: `ac7b5a410211bb257033943a729ad852e0d16fb8`, [AI infrastructure run 41185478559](https://github.com/dinnelthai/logearn-growth/actions/runs/41185478559) **success** (Contract/Integration/Frontend).
- **Problem and fix:** `get_channel_economics` historically stored the manually entered CRM/KOL partner ledger under `trade_revenue`, inviting confusion with platform income. The current tool now stores `collaboration_economics` **v1**; `trade_revenue` remains a separate **v2 formal unavailable** platform-income metric. Ledger currency counts/ROI are not transaction notional, platform fees or verified income coverage. The older stored v1 evidence remains immutable and replayable.
- **Business Brain** `logearn-business-brain-v2` with metric dictionary `2` now distinguishes the two metrics and leaves platform income unknown. The 22KB input budget is unchanged; run 41185478559 covers new v2 fixture validation. Archived v1-v4 model contexts retain their stored inputs and contracts.
- **Files:** `backend/src/ai/business/metricRegistry.js`, `backend/src/ai/business/businessBrain.js`, `backend/src/ai/business/tools/registry.js`, `backend/src/ai/business/tools/businessModuleCatalog.js`, `backend/src/ai/growth/weeklyCoverage.js`; related test updates `agentTools.test.js`, `aiBusinessBrain.test.js`, `aiWeeklyModuleSummaries.test.js`, `aiWeeklyContextV4.test.js`.
- **Roadmap:** code-only Phase 2 separation checkbox is now checked. **38/48 = 79.2%, 10 open; Phase 2 3/8.** Outstanding Phase 2 tasks: complete source contract audit, mature registration→multiple product-entry→trade journey, GSC/X/KOL/invite source date semantics, valid channel/product/cohort segmentation and per-source freshness/watermark propagation.
- **Unmet external acceptance:** actual platform trading fee/revenue source still missing; do not assert platform revenue is 0. Real Hologres matching, GSC PT alignment, X/KOL freshness and v5 model reports remain unverified. No new migration, paid model, deployment or external writes were performed.

## 2026-10-31 — Phase 2 GSC/X/KOL/invite source as-of contract

- **Verified source/test SHA:** `14f42ba61c785866e918df3ca841bf4525f35bc2`; [AI infrastructure 41185823229](https://github.com/dinnelthai/logearn-growth/actions/runs/41185823229) successful across AI Contract / Integration / Frontend. This run now includes an explicit owner-scoped source-contract test step covering GSC date slicing, X historical posts/followers, model-safe follower summary, KOL aggregation, invite identity and referral maturity.
- **Source audit guide:** `docs/ai/GROWTH_SOURCE_CONTRACTS.md` (read next when continuing Phase 2). Documents actual date/time contracts and non-attribution boundaries, not a license to collect from external services.
- **X fix:** `backend/src/ai/business/tools/contentAdapters.js` now rejects daily follower history snapshots whose `observed_at` is at or after the report cutoff. Historical follower scan progress is only read when `updated_at` predates cutoff. A post classification updated after cutoff is `unknown` in historical views; manual review without `reviewed_at` cannot be accurately time-stamped.
- **Transport fix:** `backend/src/ai/business/tools/weeklyModuleSummaries.js` omits `reviewedRecords` rather than reporting a numeric 0 when the source review timestamp is missing. Tests protect source scope, non-replay of future values and model projection.
- **No duplication:** GSC uses the existing PT-day stored summary, KOL the existing tagged-CRM/Hologres snapshot path, referral/invite the existing verified relationship and mature flow services. The fixture suite confirms semantic boundaries but does not establish live source presence, paid access, or causality.
- **Progress:** `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` now **39/48 (81.3%), 9 open**, Phase 2 **4/8**. Open Phase 2 tasks: complete module/source audit; fully mature registration→parallel engagement→trade journey; supported channel/product/cohort dimensions; independent source watermark/freshness/coverage for each metric. Operator review and real-source/model integration acceptance remain separate.
- **Constraints:** no migrations, external paid sync, paid AI calls, deployment or external publishing performed. No changes to any other branch.

## 2026-10-31 — Source-specific evidence watermark continuation

- **Code/test HEAD:** `8a7f71c98fce502b68a056671ee9a95304507abb`. [AI infrastructure CI 41186244825](https://github.com/dinnelthai/logearn-growth/actions/runs/41186244825) **success** (Contract, Integration, Frontend). The current branch HEAD advances with documentation changes; never reuse this SHA as a read/write lock without refetching.
- **Why:** `get_seo_performance` previously stored the manual `importedAt` (which the bounded projection can omit) as its only Search Console watermark, missing authentic API `syncedAt`. X and KOL specialist results also had no independent model-visible source watermark; the CRM collaboration ledger had an unrelated event-store watermark and unnecessarily depended on Hologres health.
- **Fix:** `backend/src/ai/business/tools/registry.js` chooses conservative per-adapter source IDs and timestamps directly from read-only adapter payloads: GSC `snapshotId` with API `syncedAt` or manual `importedAt`; X latest bounded post observation; follower scan's latest recorded progress; KOL `snapshotId/asOf` only when available; CRM manual ledger has no complete-through watermark and does not call Hologres status. Other remote event metrics retain event watermark with independent registration/trade limitations.
- **Model projection:** `backend/src/ai/business/modelTransport.js` passes only trusted `sourceVersions.x/kol/followerScan` and `watermarks.searchConsole/x/kol/followerScan`, if present, without exposing raw posts, accounts or user IDs. Evidence remains owner-scoped/immutable.
- **Tests:** `backend/test/growthSpecialistTools.test.js` verifies GSC API vs manual import, X/KOL/follower independent source times, model-visible provenance, null when source absent. `backend/test/agentTools.test.js` proves local CRM ledger reports no Hologres event watermark and remains usable if Hologres status cannot be read.
- **Reference:** `docs/ai/GROWTH_SOURCE_CONTRACTS.md` includes the source/time matrix, semantic limits and unresolved contract gates.
- **Checklist:** **39/48 (81.3%), 9 open; Phase 2 4/8, remaining 4 Phase 2 items.** This is a verified **subtask** of the larger “each metric's source watermark/coverage/freshness/scope/version” requirement, not full completion. Missing source coverage is unknown, never a fabricated 0 or fully current observation. Real-source acceptance, billing, deployment and model interpretation have not been performed.

## 2026-10-31 — Registration journey and parallel product engagement

- **Validated source/test HEAD:** `a4f421400160d1a895e5032d7614062946e6f731`; [AI infrastructure CI 41187724624](https://github.com/dinnelthai/logearn-growth/actions/runs/41187724624) passed Contract, Integration and Frontend.
- **New metric:** `registered_user_journey` in the existing `query_metrics` tool; added to the `growth-overview` skill. Reuses existing `growthInsights`, `registrationFacts`, `cohortTrades` and `metricRegistry`.
- **Semantics:** real `account_v2.created_at` registrations; mature 24h first-chip activation; five distinct 7d entry metrics (chip, Holder, strategy, signal, repeat analysis) over a shared mature registration denominator; and separate user-level trade conversion within 168h after first analysis for mature identity-verified accounts. Product entries overlap and must not be added or turned into a serial funnel.
- **Completeness:** event `historyComplete` and `eventsCompleteThrough` are passed through when supplied. Registration and trade source watermarks remain null; no generic event watermark is substituted. Unsupported device/version grouping for this metric is rejected. Source filter includes only accounts with an observed matching source.
- **Evidence safety:** nested journey fields are explicitly allowlisted in model transport; weekly facts preserve activation, parallel product-entry counts and trade conversion. User rows, IDs, wallets and member lists remain excluded.
- **Tests:** `aiBusinessMetricsAdapter.test.js`, `agentTools.test.js`, `aiWeeklyCoverage.test.js`; underlying maturity/identity semantics also covered by `growthInsights.test.js` and `growthCohortTrades.test.js`.
- **Checklist:** **40/48 (83.3%), 8 open; Phase 2 5/8**. Live event completeness, registration/trade freshness, identity coverage and production acceptance remain pending. Next: exhaustive module/source audit, supported breakdowns and complete per-metric provenance.
- No migrations, paid calls, production deployment, external collection or writes.

## 2026-10-31 — Registration-to-trade seven-day cohort clock correction

- Source/test HEAD `a0a7f210ad28dc710062b5907255eacfa1ddceca`; [AI CI 41191137847](https://github.com/dinnelthai/logearn-growth/actions/runs/41191137847) passed all Contract/Integration/Frontend jobs.
- In `backend/src/analytics/growthInsights.js`, the **registered** cohort's trade branch now requires first observed chip analysis in the half-open `[registered_at, registered_at + 7 days)` window. The subsequent **trade** follow-up still uses its separate mature `[first_chip_at, first_chip_at + 7 days)` window. Users first analysing after registration day seven are `not_engaged` for this specific registered cohort, not silently added to the trade conversion denominator; other observed/channel cohorts preserve their existing first-analysis anchor.
- In `backend/src/data/growthInsights.js`, `cohortTrades()` excludes these late registered-first-analysis records from remote trade lookup windows to match the analytical numerator and avoid unnecessary reads. Tests: `backend/test/growthCohorts.test.js`, `backend/test/growthCohortTrades.test.js` cover strict day-seven boundary and query parameters.
- The branch already included `registered_user_journey` as a completed code/CI checklist task before this correction. This update hardens that contract; **40/48 (83.3%), 8 open** remains unchanged. Live registration and trading data coverage/watermark acceptance is not established; no paid call, deployment or migration.

## 2026-10-31 — Phase 2 supported registration source breakdown (41/48)

- Source/test HEAD: `7044ef3859c551002f543c0d8d178cbd142877dc`. [AI CI run 41198640425](https://github.com/dinnelthai/logearn-growth/actions/runs/41198640425) **success** for Contract, Integration and Frontend after correcting fixture syntax, evidence path assertion and missing archived `body.dimensions` (query fingerprint).
- `backend/src/analytics/growthCohorts.js` now aggregates **observed-source** registration rows, keeping the 4 largest safe source labels plus `other` and explicit `unknown`. Each source has its actual population, mature 24h activated/eligible/pending, and mature 7d chip/Holder/strategy/signal/repeat-entry counts. Product entries overlap and are never a serial funnel. Outputs are aggregates without account IDs.
- `backend/src/ai/business/metricRegistry.js` advertises `['source']` only for `registered_user_journey`; do not re-advertise unsupported growth device/version splits. `backend/src/ai/business/tools/registry.js` accepts only `query_metrics({metrics:['registered_user_journey'],dimensions:['source']})` for grouping and archives the identical dimensions with the authorized query body/fingerprint. Unsupported grouped requests fail *before* expensive work. Overall ungrouped queries remain unchanged.
- `backend/src/ai/business/tools/adapters.js` projects `value.registration.bySource` **only on explicit request**, with source-level mature activation and product-entry counts/ratios, not a made-up source transaction rate. `backend/src/ai/growth/weeklyCoverage.js` reserves bounded, evidence-linked source facts for citation (two source rows under its 12-fact budget); the existing overall journey citation paths are unchanged for ungrouped queries.
- Regression: `backend/test/growthCohorts.test.js`, `backend/test/aiBusinessMetricsAdapter.test.js`, `backend/test/agentTools.test.js`, `backend/test/aiWeeklyCoverage.test.js`. Tests confirm per-source mature denominators, unknown source, overflow/no user IDs, model-visible projections, dimension rejection and exact evidence fingerprint.
- **Scope boundary:** These labels derive from `facts.source` observed analytics association, **not** immutable first-touch or independently verified registration acquisition. They can be absent, changed or incomplete. Trade facts and verified identity matching remain at the **overall** registration cohort level, never partitioned as if a causal channel assignment were proven. Real-source Hologres/CRM coverage, event completeness, registration/trade independent watermarks and live AI report verification still pending.
- **Checklist:** Phase 2 source-supported breakdown checkbox newly checked. Total **41/48 (85.4%)**, 7 unchecked, Phase 2 **6/8**. Remaining Phase 2: audit all module source contracts and complete metric-level independent source watermark/freshness/coverage. No migrations, paid model/collector calls, external publication, deployment or changes to `master`.

## 2026-10-31 — Full source contract audit / corrected invite association evidence

- **Source/test HEAD:** `1f6ca609ac864cb3877208136e8e9c8dae29ddae`. [AI CI 41199595293](https://github.com/dinnelthai/logearn-growth/actions/runs/41199595293) **success** (Contract/Integration/Frontend). Current branch HEAD advances after documentation edits; refetch before any modification.
- **All 18 built-in investigation IDs audited:** `backend/src/ai/business/tools/sourceContracts.js` maps source type, observation-clock semantics and interpretation limits with exact one-to-one parity to `registry.listToolIds()`. `backend/src/ai/business/tools/businessModuleCatalog.js` exposes the contract per capability for the **9 existing module facades** and no longer labels every non-GSC tool as generic business observation. Optional OpenSEO stays in its separately secured plugin/owner/cost gate and was neither invoked nor treated as fresh.
- **Correctness fix:** `backend/src/ai/business/tools/registry.js` `conversionSummary` no longer upgrades invite coverage to `verified` solely because `history_complete=true`: now `coverage.status='partial'` and `historyComplete` is separately retained. `backend/src/ai/business/modelTransport.js` now allowlists only sanitized aggregate `association` state fields (available/status/reason) in the invitation model evidence, so unavailable binding/registration linkage stays visible. No individual binding/member records are transmitted.
- **CI tests:** `backend/test/businessModuleCatalog.test.js` locks 18/18 catalog parity and module source metadata. `backend/test/agentTools.test.js` verifies verified-status never arises from event history alone and that missing relationship associations survive the model projection. Existing owner/scope limits remain unchanged.
- **Source matrix:** `docs/ai/GROWTH_SOURCE_CONTRACTS.md` includes all 18 tool rows with source, clock, critical semantics and post-audit findings. The *code-contract audit* Phase 2 checkbox is complete; the remaining Phase 2 checkbox is the **independent source watermark/coverage/freshness/metric version across compound sources**, including real Hologres/GSC/X/CRM/source matching acceptance. Do not claim actual availability or complete-through data.
- **Progress:** **42/48 = 87.5%; Phase 2 7/8; 6 open**. No database migration, deployment, external write, paid model/API call or `master` branch change.

## 2026-10-31 — Phase 2 last code contract: per-metric source freshness envelope

- **Source/test HEAD:** `e5a08a39d4668d2895c23bc5997946885292a9a0`; [AI CI 41200563427](https://github.com/dinnelthai/logearn-growth/actions/runs/41200563427): **success** (Contract / Integration / Frontend). Do not confuse source/test SHA with later documentation-only branch HEAD.
- `backend/src/ai/business/sourceMetadata.js` is the only new helper. It derives a small per-tool/per-metric source type and observation clock from the already audited `tools/sourceContracts.js`. Built-in metric subtypes distinguish event snapshots, actual `account_v2` registration creation, registration+events, and registration+events+verified-trade evidence. Do not use a shared Hologres event `as_of` as the independently complete registration/trade watermark.
- `backend/src/ai/business/evidence.js#makeEvidence` now stores `sourceMetadata` on every newly created internal metric evidence, along with immutable owner authorization scope, period, metric `definitionVersion`, actual `watermarks`, `coverage` and query fingerprint. Explicit channel filter `filters.source` correctly sets the source metadata's observed-source scope **without changing the access-control scope**.
- The metadata has `sourceType`, `clock`, `scope`, `coverageStatus` and `freshness:{status,referenceAt,reportedCompleteThrough}`. `status` is **unknown** with no usable real reference time, otherwise **unverified**, NEVER automatically fresh/complete. Source reference time may be an event cutoff, GSC sync/import timestamp, X bounded post observation, KOL snapshot or follower-scan update; compound sources have no single complete clock. `reportedCompleteThrough` is filled only when Hologres actually supplied `events_complete_through`; it is *reported*, not independently verified.
- `backend/src/ai/business/tools/registry.js` now archives the observed event complete-through on each applicable `query_metrics` evidence instead of dropping it; independent registration/trade watermarks remain null. `backend/src/ai/business/modelTransport.js` and `backend/src/ai/business/modelEvidence.js` preserve allowlisted bounded metadata in full and compact model messages, with unknown versions/watermarks projected as **null** rather than empty strings. Old archived evidence remains readable without the new metadata.
- **Proof:** `backend/test/businessModuleCatalog.test.js` checks all 18 built-in tools against source clocks, periods, definition versions and unknowns; `backend/test/agentTools.test.js` covers event vs account vs mixed trade provenance, GSC, manual CRM and source scopes; `backend/test/modelEvidenceCompact.test.js` checks bounded 3500-byte v4 projection without inventing freshness.
- **Progress:** Phase 2 **8/8 at code/CI**, overall **43/48 (89.6%), 5 open**. Remaining checkboxes: Phase 1 already-authorized real v5 context review and human product-map/North Star approval; Phase 3 stable activity/outcome links; Phase 4 two evidence-based cost-aware query planning tasks. **Live acceptance remains separate:** source data may still be absent, stale, truncated, identity-unmatched or unobservably late. Never claim real Hologres registration/trade completeness, GSC PT-day finality, X/KOL freshness, paid model/Worker success from these fixtures.
- No paid model calls, external collection, migrations, deployment or change to `master` in this pass. Future agent should start by reading `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` and `docs/ai/GROWTH_SOURCE_CONTRACTS.md`.

## 2026-10-31 — Operating Memory mature activity outcomes with stable associations

- **Source/test HEAD** `81bc9a06fba358c484eed9bb620ab303110d8ed5`; [AI CI run 41201630015](https://github.com/dinnelthai/logearn-growth/actions/runs/41201630015) successful on Contract, Integration and Frontend. Branch HEAD after documentation updates is later; always refetch before editing.
- **Historical as-of fix:** `backend/src/ai/business/tools/operationsTimeline.js#activityOutcome(row,periodEnd)` now hides settlement results when `settled_at >= periodEnd`, including sources whose own settlement `as_of` (or `snapshot_cutoff`) is after the requested end. Previously a historic week could display a settlement completed later. KOL period observations now carry a separate `capturedAt` field from their measured source observation timestamp, because a source watermark is not a collection time.
- **Strict operational relationships:** `backend/src/ai/business/tools/registry.js#operationsTimelineSummary` adds **at most eight** `outcomeLinks` from explicit same-owner CRM collaboration→activity IDs *only when* the linked activity is fully contained in the collaboration period, settled before period end, and its observation snapshot covers the activity end without future cutoff. Observed `completed`, `analysis_users`, `trade_users`, `transactions` are copied only if the appropriate source coverage is `available`; unknowns stay absent. IDs become opaque `record:[hash]` refs. This is **observed activity outcome association, not effect attribution**.
- **Strict channel relationships:** at most eight `channelLinks` from a same-owner CRM KOL ID + explicit linked collaboration ref, provided the observed KOL period fully contains the collaboration, the observation source time covers its end, and independently saved snapshot `capturedAt` is present and <= report end. Outputs are per-KOL observed aggregates and labelled `observed-overlap-not-causal`, not per-collaboration added users. Snapshots captured later, missing metadata, incomplete windows or incorrect KOL IDs do **not** link, even if events happen around the same day.
- **Model privacy:** `backend/src/ai/business/modelTransport.js` adds only `outcomeLinks`, `channelLinks`, hashed `collaborationRef/activityRef`, bounded non-personal metrics and observed timestamps to the positive allowlist; no raw user IDs, wallet/token addresses or account/member rows. No new SQL/collector, database migration or parallel CRM.
- **Tests:** `backend/test/operationsTimeline.test.js` checks actual owner-scoped timeline settlement as-of; `backend/test/operationsTimelineRegistry.test.js` checks valid links, matched windows, same-KOL identity, incomplete/after-cutoff/uncaptured cases and absence of raw collaboration/activity IDs. The existing generic model evidence and CI suites remain green.
- **Progress:** Phase 3 **8/8 code/fixture CI**. Total **44/48 = 91.7%**, **4 open**. Next phase: Phase 4 two *measured-cost-aware* decision items; Phase 1 two real authorized context / operator product-map signoff items. No real production/KOL causal outcome acceptance, paid model call, deployment or `master` change. Review `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md` and `docs/ai/GROWTH_SOURCE_CONTRACTS.md` before continuing.

## 2026-10-31 — Phase 4 decision engine measured latency and competing-hypothesis inquiry

**Final code/test SHA** `6540a7a353b5fadb080f016afa2aa2b8795ece0f`. [AI infrastructure 41204481078](https://github.com/dinnelthai/logearn-growth/actions/runs/41204481078) **success** (Contract / Integration / Frontend). The branch HEAD is later after documentation; fetch before each edit.

### Runtime integration and provenance

- `backend/src/ai/business/tools/registry.js` measures the monotonic server **wall time of successful tool operation** and gives it to existing immutable `makeEvidence()` as `executionTiming:{elapsedMs,kind:'observed-server-wall-time',monetaryCostKnown:false}`. One timing observation per `query_metrics` multi-metric invocation, not one per metric. Failures and timeouts produce no successful timing. This is **not a database scan cost, external USD charge, or full service latency**.
- `backend/src/ai/business/evidence.js#createEvidenceStore.recentToolTimings()` reads only `agent_evidence` rows of the authorized owner from the previous 30 days, filters malformed/out-of-period records, enforces exact source/fixed audience and similar reporting time span, and releases only medians with **3+ matching successful samples**; otherwise unknown. It requires no new table or new schema migration. The owner-specific timing reader is available on `createToolRegistry().observedToolTimings`.
- `backend/src/ai/growth/queryEconomics.js`: only compares validated, authorized candidate tool IDs with owner-local measured medians. It provides `bestObservedLatencyTool` **only if every alternative has a real comparable sample**. Any missing timing means `insufficient-observed-cost-data`; paid/unknown capability price blocks automatic "cheapest" recommendation; `monetaryCost:'unknown'` persists always.
- `backend/src/ai/growth/questionPriority.js`: orders existing report candidates by goal relevance, original P0/P1/P2 priority, explicitly observed affected population (not estimated from count deltas), like-metric count movement, evidence-backed confidence and authorized measured latency, never fabricating an ROI or user impact. It is a candidate attention ranking, not KPI redefinition or formal statistical significance.
- `backend/src/ai/growth/planner.js` accepts an owner-scoped timing reader and attaches `questionRanking` and concise prompt hints. `backend/src/queues/jobs/businessAnalysis.js` **actually reads the owner-local archive in the Worker**, then pins a filtered immutable timing snapshot for the final *currently authorized* tool list in analysis context before charging the model; owner-local read failure returns unknown rather than blocking the business report. Recovered contexts use saved prices/timings; no unstated fresh rewrite.
- `backend/src/ai/growth/modulePlanner.js` may pick an alternative read-only capability within a module by lower measured median **only when every candidate is comparable**; otherwise retains reviewed/default ordering. The measured-latency comparison is explanatory and grants no new right to invoke the tool.
- `backend/src/ai/business/analysisContract.js` already validates 2–3 genuinely distinct cause explanations and discriminating tool+input under task capabilities, schema, source, period and owner evidence store; for strict v2 it now appends `discriminatingQueryEfficiency` **after** validation using the pinned owner timing snapshot. There is no automatic query execution or external paid call and no claim of actual information gain.
- `modelTransport.js` and `weeklyContextV4.js` expose **only 3–5 bounded, permit-filtered, aggregate question-priority items**, not the evidence records or identities. The strict 22KB context and weekly 13-module KPI/statistics priority remain protected; optional timing hints are dropped first under pressure.

### Verification and finish-line scope

- Tests updated: `agentEvidence.test.js` (owner isolation, minimum sample count, time-span/scope exclusion, unknown currency), `growthPlanner.test.js` (goal vs population vs count delta vs authorization), `modulePlanner.test.js` (comparable latency vs unknown fallback), `analysisCompetingHypotheses.test.js` (authorized competing causes, schema, unknown/paid cost), `growthStatisticalModelTransport.test.js` and `aiWeeklyContextBudget.test.js` (no personal identifiers, v5 standard/weekly bounded model transport). All code + CI checks passed.
- Checklist: **46/48 = 95.8%**, Phase 4 **6/6 code/CI**, **2 open**. Remaining Phase 1 items: replay/test **an already-authorized genuine v5 business context with no new paid call**; **operator review/signoff** on the product map and North Star. Do not claim either is complete without actual evidence/approval.
- Real source freshness, live Worker/report behavior, the information value of particular investigations, true incremental effect and **actual financial query cost** remain *unverified*. A lower observed median is not a guaranteed fastest or cheapest future query and does not prove causality. No paid model/API calls, deployment, migrations, production writes or `master` merge.
