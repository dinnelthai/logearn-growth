# Growth Agent 2.0 — 实施进度日志

All dates use repository commit time / recorded work date. This log is append-only in intent: update progress without erasing prior test outcomes.

## 2026-10-31 — Business Brain v1 foundation

Branch: `codex/ai-comprehensive-upgrade`

### Added

- `backend/src/ai/business/businessBrain.js`
  - `logearn-business-brain-v1`
  - four product roles: AI Strategy, Chip Distribution, Holder Ranking, Wallet Trading;
  - seven lifecycle stages: acquisition, registration, activation, engagement, retention, trading, economics;
  - compact metric dictionary sourced from `metricRegistry`;
  - operating rules covering first-observed analysis vs registration, unknown vs zero, channel attribution, trade volume vs revenue, multiple product entry points and causality;
  - bounded projection of up to three owner-scoped AI suggestion/review memories.
- `backend/src/ai/business/modelTransport.js`
  - new `v5` context transport for new analysis;
  - Business Brain and operating memory are added after the existing aggregate-only projection;
  - dynamic byte reservation and hard 22KB cap.
- `backend/src/ai/business/weeklyContextV4.js`
  - accepts a context-byte reservation for v5; default v4 behavior remains unchanged.
- `backend/src/ai/business/runner.js`
  - supports `token-efficiency-v5`;
  - v5 tool results use bounded projection and weekly duplicate-query protections;
  - recovery detects the archived v5 marker; v1-v4 markers remain recognized.
- `backend/src/queues/jobs/businessAnalysis.js`
  - newly created analyses use v5 unless `AI_BUSINESS_BRAIN_V5_ENABLED=0`;
  - new weekly reports use v5 unless `AI_WEEKLY_CONTEXT_V5_ENABLED=0`;
  - archived jobs keep the prompt / transport version saved at creation.
- `backend/src/ai/growth/weeklyReport.js`
  - adds `weeklyPromptV3` to orient new reports around LogEarn lifecycle and business outcomes.
- Tests added to `backend/test/aiBusinessBrain.test.js` and `backend/test/aiWeeklyContextV4.test.js`.

### Important boundaries

- Business Brain is business semantics, not numeric evidence or tool permission.
- The North Star statement is recorded as an operator direction, not a validated composite KPI.
- Operating memory currently covers AI suggestion / retrospective history only, not all human KOL, SEO, X, community or campaign activity.
- No new database migration, external API call, paid model call, deployment or production configuration change was made.
- No full Node test suite or real Worker/model acceptance has yet been run in the current environment.

### Validation performed

- All edited JavaScript source strings passed syntax compilation through the GitHub-backed source inspection workflow.
- An isolated execution of the actual v5 model-context builders passed for both generic analysis and a 12-module weekly context fixture.
- Observed serialized model context sizes in that isolated run: generic 8,457 bytes; weekly 13,817 bytes; both under 22,000 bytes.
- This is an isolated projection check, not a replacement for `node --test`, a live API/Worker run or real-source acceptance.

### Next

1. Run focused tests in a local checkout.
2. Verify the current report custom-period request is implemented on this branch; the branch UI currently needs explicit review because the earlier custom-period change was made on another branch.
3. Continue Phase 2 source-contract review, prioritizing product-to-trade and real registration / activation separation.
4. Implement an operations timeline by reusing existing KOL, SEO, X/content and operation-task records.


## 2026-10-31 — Custom report periods, green CI and product-to-trade query bounding

### Custom report period completion

- Corrected v5 custom-period prompt composition: it now derives from the weekly report structure while replacing natural-week language with a selected reporting period and equal-length prior period. Business Brain reasoning is retained.
- Corrected the exact 31-day validation boundary; 31 days is valid, anything longer is rejected.
- Aligned history selection, displayed date-time inputs, regeneration target and timeout-recovery period with the selected report record.
- Preserved disabled regeneration controls for reports that are still processing and restored legacy weekly delete copy.
- Added backend tests for exact timestamps, equal-length comparison, prompt semantics, idempotency and 31-day bounds; added frontend tests for custom selection, submission, reset and historical custom reports.

### Product-to-trade lookup optimization

- `backend/src/data/productChainTrades.js` now builds bounded lookup windows from successful, user-triggered analysis requests with token visit, token and chain context.
- The SQL uses the existing verified-wallet identity precedence and limits transaction rows to trades after those successful analyses, within the 24-hour observation window.
- Merges overlapping account/chain windows; caps at 5,000 windows and 20,000 trade rows; enriches hashes in 2,000-row batches with ledger and indexed-swap reads in parallel.
- Exposes trade-row truncation and window truncation in product-chain quality diagnostics. Missing/truncated/unmatched data remains unknown; it is never turned into a zero-trade claim.
- `remoteAnalysis.js` now passes the validated request-analysis rows into the trade lookup.
- Added regression tests for analysis-window filtering, interval merging, identity mapping, exact-chain/hash token enrichment, failure-as-unknown and no-query behavior when no valid analysis exists.

### CI and regression results

The upgrade branch now runs the relevant GitHub Actions workflows on push.

- AI infrastructure run: [41156542441](https://github.com/dinnelthai/logearn-growth/actions/runs/41156542441) — **success**.
  - AI contract suites: 166 passed, 0 failed, 1 skipped; additional suites 22/22 and 112/112.
  - AI integration: 17 passed, 0 failed (PostgreSQL + Redis service containers).
  - AI frontend contract suites: 24/24 and 4/4.
- Desktop UI regression run: [41155768483](https://github.com/dinnelthai/logearn-growth/actions/runs/41155768483) — **success**.
  - 429 passed, 0 failed, 4 skipped.

The first CI runs exposed and led to fixes for a registry-unknown metric reference, pending-report UI regression, delete-copy regression, an incorrect operating-memory test expectation and a stale autonomy strategy test fixture. The final runs above include those fixes.

### Validation boundary

- CI tests use test fixtures and service containers; they do not validate the user's live Hologres data, local API/Worker, live GSC/X connections or a real paid model invocation.
- The product-to-trade query is now narrower and bounded in code, but its live latency and match coverage still require observation against the actual read-only source.
- No database migration, paid model call, paid external collection, deployment or public write occurred.

### Next implementation focus

1. Complete registration-vs-first-analysis source contract and activation denominator/maturity review.
2. Verify the custom report and product-to-trade path against a real, already-authorized read-only source without initiating a paid model call.
3. Build the operating activity timeline by reusing existing KOL, SEO, content/X and operation-task records.


## 2026-10-31 — Operating Memory v1 timeline and settled activity outcomes

Branch: codex/ai-comprehensive-upgrade

### Added / changed

- backend/src/ai/business/tools/operationsTimeline.js
  - Added an owner-scoped, period-bounded read-only timeline that reuses existing growth activities, KOL collaborations, manual content records, operation tasks, X official-account snapshots, Search Console snapshots, KOL observations, AI report actions and specialist signals.
  - Keeps human operations, channel observations and AI suggestions/reviews as separate layers; each source reports available/empty/not-configured/unavailable/truncated coverage.
  - Reads only aggregate activity assignment/delivery states. The latest sent/delivered/not-delivered record is evaluated as of the selected period end; cross-exposure is an independent aggregate.
  - Includes frozen settled activity summary, performance totals and target progress only when settled_result exists. User rows, IDs and delivery evidence text are not projected.
- backend/src/ai/business/tools/registry.js and modelTransport.js
  - Added an allowlisted projection for activity group outcomes and frozen settlement aggregates; source coverage and unknown values remain explicit.
- backend/src/ai/growth/weeklyCoverage.js and backend/src/ai/business/weeklyContextV4.js
  - Added the operations-timeline weekly module and prioritized settled activity outcomes plus treatment/control delivery aggregates in bounded evidence facts.
  - Preserved the existing query cap and 22KB context limit.
- backend/src/ai/business/businessBrain.js and backend/src/ai/growth/weeklyReport.js
  - Defined the three operating layers and instructed reports that unsettled/missing results are unknown, manually assigned treatment/control groups are not randomized, and observed group differences are not causal proof.

### Regression coverage

- Added/updated operationsTimeline.test.js, operationsTimelineRegistry.test.js, aiWeeklyCoverage.test.js, aiWeeklyContextV4.test.js, aiBusinessBrain.test.js and aiWeeklyReport.test.js.
- Verified source failure isolation, owner scope, Search Console PT date conversion, no user-ID/member-row projection, frozen activity outcomes, both manual groups, weekly facts and Business Brain rules.

### CI validation

- AI infrastructure run [41164982501](https://github.com/dinnelthai/logearn-growth/actions/runs/41164982501) — **success** across AI Contract, AI Frontend and AI Integration.
- AI Contract: 167 total / 166 passed / 0 failed / 1 skipped; targeted timeline/module discovery 37/37; Business Brain/custom report regression 32/32; additional suites 13/13, 22/22, 2/2 and 112/112.
- AI Integration: 17/17 passed. AI Frontend job succeeded.
- These are CI fixture/service-container checks. Live Hologres, GSC/X providers, local API/Worker and real paid model execution were not invoked.

### Remaining limitations

- No stable post/campaign identifier currently joins all manual activities to X/GSC observations; do not infer channel attribution from temporal overlap.
- Community/training platforms have no dedicated connector; only existing growth activity/task records can represent them.
- Live source freshness, settled activity match coverage and latency still require read-only validation on an already-authorized source.
- No migration, paid model call, paid collection, deployment, public posting or external action occurred.

## 2026-10-31 — X account freshness and period coverage semantics

- `backend/src/ai/business/tools/operationsTimeline.js` now distinguishes X source state per configured account:
  - `available`: successful sync and at least one post in the selected period;
  - `empty`: successful sync but no post in the selected period;
  - `not_synced`: no successful sync watermark;
  - `unavailable`: failed sync/read;
  - `not_configured`: provider is not configured.
- The overall X coverage state is derived from the per-account states; one synced account no longer hides another account that has never synced.
- Numeric `lastSynced` values are accepted as epoch milliseconds; this was caught by CI regression tests and fixed.
- `backend/src/ai/business/modelTransport.js` now preserves the per-account coverage array through the aggregate-only allowlist. Public account labels and status are retained; post bodies and identity data remain excluded.
- Regression tests cover available posts, a successfully synced empty period, unsynced accounts, and provider failure isolation.

### CI validation

- AI infrastructure run [41168249767](https://github.com/dinnelthai/logearn-growth/actions/runs/41168249767) — **success** across AI Contract, AI Frontend and AI Integration.
- AI Contract groups: 32/32, 13/13, 22/22, 2/2 and 112/112; AI Integration: 17/17; AI Frontend succeeded.
- This remains fixture/service-container validation. No live X/GSC/Hologres read, local Worker run, paid model call, paid collection, migration or deployment was performed.

## 2026-10-31 — Registration cohort metrics in Growth investigations

- Reviewed the existing source contract: `registrationFacts` reads real `account_v2.created_at` facts, preserves registrations without a first-analysis event, and keeps source attribution scope explicit.
- `growthCohorts` computes registration → first chip-analysis activation with a mature 24-hour denominator and pending registrations kept separate.
- The existing trade cohort computes first-analysis → 7-day user-level trade conversion only for mature users with verifiable account identity; unmatched identities and unavailable trade facts remain unknown.
- Updated the Growth Overview skill signals and the business-analysis growth metric bundle to include `registered_users`, `registration_activation_rate` and `registered_trade_conversion_rate`.
- Added these aggregate metric names to the weekly evidence allowlist and regression coverage proving the mature registration/trade cohort facts can be projected.
- Important remaining gap: this is not yet a single verified registration → activation → product engagement → trade funnel. The existing funnel tool's supported event steps and the registration cohort are separate contracts; do not describe them as one fully linked funnel.

### CI validation

- AI infrastructure run [41168785078](https://github.com/dinnelthai/logearn-growth/actions/runs/41168785078) — **success** across AI Contract, AI Frontend and AI Integration.
- AI Contract groups: 32/32, 13/13, 22/22, 2/2 and 112/112; AI Integration: 17/17; AI Frontend succeeded.
- No live Hologres read, paid model call, paid collection, migration or deployment was performed.

## 2026-10-31 — Registration metrics enter the formal Growth decision vocabulary

- Added formal definitions for `registered_users`, `registration_activation_rate` and `registered_trade_conversion_rate` to the shared business metric definitions. The definitions explicitly distinguish registration from first observed analysis, require mature denominators and preserve user-level (not same-Token or causal) trade attribution.
- The Growth planner now accepts these metrics as reviewed investigation focus hints, and the Agent Learning metric allowlist recognizes them through the shared definition registry.
- The Business Brain metric dictionary was compacted slightly to preserve the hard 22KB context budget after expanding the formal metric vocabulary.
- The registration cohort is still not a single end-to-end product-engagement funnel; see the prior section for the remaining boundary.

### CI validation

- AI infrastructure run [41169098472](https://github.com/dinnelthai/logearn-growth/actions/runs/41169098472) — **success** across AI Contract, AI Frontend and AI Integration.
- AI Contract groups: 32/32, 13/13, 22/22, 2/2 and 112/112; AI Integration: 17/17; AI Frontend succeeded.
- The earlier run [41169006336](https://github.com/dinnelthai/logearn-growth/actions/runs/41169006336) caught the context-size regression before this compaction; the corrected code passed the complete run above.

## 2026-10-31 — Registration cohort signals in deterministic triage

- Extended the deterministic triage allowlist to recognize the two mature registration cohort rates; rate concerns can now be promoted as investigation signals without treating them as causal conclusions.
- Registration count changes can also enter the existing count-movement rule when a comparable candidate is present.
- Added regression coverage that orders registration trade/activation rate signals by existing priority and score, and confirms each remains an investigation cue with `causalClaim:false`.
- The business report must still supply comparable, evidence-backed candidates; this change does not fabricate a previous-period baseline.

### CI validation

- AI infrastructure run [41169268207](https://github.com/dinnelthai/logearn-growth/actions/runs/41169268207) — **success** across AI Contract, AI Frontend and AI Integration.
- AI Contract groups: 32/32, 13/13, 22/22, 2/2 and 112/112; AI Integration: 17/17; AI Frontend succeeded.

## 2026-10-31 — Registered-cohort product engagement evidence

- Extended the existing owner-scoped `registrationFacts` query using the canonical event map, not invented event names. It now returns the first post-registration observation for:
  - chip analysis (`chip_analysis_viewed` / `chip_analysis_drilldown`);
  - Holder view (`holders_analysis_viewed`);
  - strategy start (`strategy_started`);
  - signal view (`signal_viewed` / `strategy_signal_viewed`);
  - repeat chip analysis after the first analysis has aged at least 24 hours.
- `growthCohorts` now reports separate counts for each product entry within seven days after registration, using only registrations with a fully matured seven-day observation window as the denominator. Pending registrations are reported separately.
- Product-entry counts are allowed to overlap. No combined engagement rate or forced linear funnel is calculated. A missing event remains an observation gap, not proof that a user did not engage.
- Updated weekly context and weekly evidence projections to preserve these aggregate counts without user IDs or member rows.
- Added regression coverage for event-source mapping, maturity, overlapping product entries and weekly evidence projection.

### CI validation

- AI infrastructure run [41169637765](https://github.com/dinnelthai/logearn-growth/actions/runs/41169637765) — **success** across AI Contract, AI Frontend and AI Integration.
- AI Contract groups: 33/33, 13/13, 23/23, 2/2 and 112/112; AI Integration: 17/17; AI Frontend succeeded.
- This is fixture/service-container validation only. No live Hologres source was queried.


## 2026-10-31 — Operating Memory: reuse operator-authored business notes

Branch: `codex/ai-comprehensive-upgrade`

### Implemented

- Extended `backend/src/ai/business/tools/operationsTimeline.js` to read the existing owner-scoped `agent_changes` store created by `contextStore.saveChange/listChanges`.
- Projects bounded notes into the existing `human_operation` layer with kind, source, occurrence time, record time, and a clear `self-reported` verification marker.
- Reuses the existing store; no parallel CRM, journal table or migration was introduced.
- The note body is treated as untrusted operator-authored context. It is length-bounded here and passes through the existing model transport text sanitizer before model use.
- Added a timeline regression fixture asserting note presence, classification and verification semantics.

### Validation boundary

- Source and test changes are committed to `codex/ai-comprehensive-upgrade`.
- Local Node tests were not run in this environment. GitHub Actions / Work acceptance is required before marking this slice verified.
- No live Hologres read, paid model call, paid external collection, migration, deployment or external action was performed.

### Remaining Operating Memory work

- Link campaign/content records to channel metrics and mature outcomes only when stable identifiers and comparable windows exist.
- Validate the new note source and its freshness against an already-authorized read-only runtime.
- Keep community/training activity unknown unless a real source or operator note exists.


## 2026-10-31 — Operating Memory: preserve explicit CRM activity links

Branch: `codex/ai-comprehensive-upgrade`

### Implemented

- Preserved each growth activity's existing record reference and exposed its CRM collaboration counterpart's linked activity references in the model-safe timeline projection.
- Added stable `recordRef` and `relatedRecordRefs` fields so the model can join collaboration, delivery, activity and settled outcome records without relying on title similarity.
- Tagged the relationship as `explicit-crm-activity-link`; it is an operational CRM link only, not proof that a channel caused registration, activation or revenue.
- Kept identifiers limited to internal business-record references; no user IDs, member rows, X post bodies or wallet data are introduced.
- Added collector and registry projection regression tests.

### Validation boundary

- Changes committed to `codex/ai-comprehensive-upgrade`; CI is required for verification.
- No live source query, paid model call, migration, deployment, external collection or external action was performed.

### Remaining

- Validate activity-to-channel relationships only where an actual shared stable identifier exists.
- For X/GSC observations without post/campaign/landing-page identity linkage, retain temporal comparison as context and label attribution unavailable.


## 2026-10-31 — Operating Memory: connect KOL observations to CRM collaborations

Branch: `codex/ai-comprehensive-upgrade`

### Implemented

- Reused the shared CRM KOL profile ID already present in `crm_collaborations.kol_id` and the existing KOL observation snapshot rows.
- Exposed a bounded per-KOL aggregate only for KOL profiles with a collaboration in the selected period: observed users, analysis users/events, trade users, transactions and volume when available.
- Added deterministic hashed `kolRef` and linked collaboration record references to the model-safe projection; raw CRM identifiers do not leave the projection.
- Kept the source semantics explicit: CRM profile matching is a stable record join, while tagged-user behavior remains observational and is not causal attribution or incremental lift.
- Added collector and safe-projection regression tests.

### Validation boundary

- Changes committed to `codex/ai-comprehensive-upgrade`; CI is required for verification.
- No live Hologres read, paid model call, migration, deployment, external collection or external action was performed.

### Remaining

- X post-level campaign linkage is not established by title or time overlap; keep it unlinked until a real shared post/campaign identifier exists.
- Search Console remains a site/query-period observation; do not attribute its clicks to individual manual content records without a landing-page/campaign join.


### CI verification update — 2026-10-31

- GitHub Actions [41171204432](https://github.com/dinnelthai/logearn-growth/actions/runs/41171204432) passed AI Contract, AI Integration and AI Frontend.
- Contract groups: 41/41, 33/33, 13/13, 23/23, 2/2 and 112/112; aggregate harness reported zero failures. Integration: 17/17. Frontend: success.
- This verifies fixture/service-container contracts for the hashed activity and KOL CRM joins; it is not a live Hologres or production runtime acceptance.
- Branch remains `codex/ai-comprehensive-upgrade`; no deployment, migration, paid model call, paid data collection or external action occurred.


## 2026-10-31 — Decision Engine: goal-ranked growth opportunities in v5

Branch: `codex/ai-comprehensive-upgrade`

### Implemented

- Added a v5-only `growthOpportunities` projection from the same period-matched `coreMetrics` and evidence references used by the report; archived v4 context remains structurally unchanged.
- Positive observed changes are ranked by the current Business Brain goal's `priorityMetrics`, then evidence completeness and relative change magnitude. Non-focus metrics keep an unknown goal rank.
- The v5 prompt now explicitly asks the model to inspect positive and negative signals, compare only like units, and verify maturity, scope, persistence and concurrent factors before calling an increase a repeatable opportunity.
- Each positive signal carries exact evidence IDs and is labeled `observed-increase;replicability-unverified` or `snapshot-increase;period-evidence-incomplete`; it is not a causal or ROI claim.
- Added regression coverage proving v5 surfaces goal-ranked positive signals and v4 remains unchanged.

### Validation

- GitHub Actions [41171641824](https://github.com/dinnelthai/logearn-growth/actions/runs/41171641824) passed AI Contract, AI Integration and AI Frontend.
- AI Contract groups: 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112; AI Integration: 17/17; AI Frontend: success.
- Fixture/service-container validation only; no live source or paid model call was used.

### Remaining Decision Engine work

- Complete prioritization using affected population and investigation/query cost, not just goal relevance, evidence completeness and relative change.
- Generate competing root-cause hypotheses and the cheapest authorized discriminating query.
- Generate fully specified actions and validate their metrics against the registry/retrospective service; prevent duplicate or already-disproved actions.


## 2026-10-31 — Decision Engine: impact-ranked investigation and competing hypotheses

Branch: `codex/ai-comprehensive-upgrade`

### Implemented

- v5 positive and negative decision signals now carry metric units, evidence coverage, goal rank and an affected-population delta only when the metric unit is a user count.
- Decision ordering compares goal relevance first, evidence completeness second, and affected population only for matching units. Relative movement is used only as a same-unit tie-breaker; unlike units are not compared by raw magnitude.
- The investigation focus now selects from both positive and negative goal-ranked signals and suggests only already-authorized candidate tools relevant to the selected metric.
- Investigation instructions require reuse of current evidence, minimum necessary authorized queries, no duplicate requests, and stopping when evidence is sufficient or no authorized discriminator exists.
- Analysis contract now supports 2–3 competing root-cause hypotheses per important unresolved recommendation, with supporting/counter evidence, missing evidence and a discriminating query.
- Runtime validation checks that each proposed query tool exists in the current task capability set. Evidence references attached to hypotheses are checked against the owner-scoped evidence store.
- If source/tool cost metadata is absent, the model is explicitly told to treat cost as unknown and not invent a price or trigger external paid collection.
- Added tests for positive-signal investigation focus and rejection of unauthorized hypothesis tools.

### Validation

- GitHub Actions [41175597697](https://github.com/dinnelthai/logearn-growth/actions/runs/41175597697) passed AI Contract, AI Integration and AI Frontend.
- AI Contract groups: 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112; AI Integration: 17/17; AI Frontend: success.
- Fixture/service-container validation only. No live business source, paid model call, external collection, migration or deployment was performed.

### Remaining

- True query-cost ranking is not implemented because the current legacy tool descriptors do not expose comparable cost/latency metadata. Do not guess it. Add reviewed cost/latency classes to trusted tool descriptors before ranking by numeric query cost.
- Root-cause hypothesis generation is now a validated output contract; verify quality against real, already-authorized analysis results before marking the full Decision Engine checklist complete.

## 2026-10-31 — Action Engine and Learning Loop hardening

Branch: `codex/ai-comprehensive-upgrade`

### Implemented

- Added a bounded structured execution brief to the existing suggestion action field (no schema migration): owner role, estimated effort, resources, dependencies, 1–5 steps, target, success criteria, suggested observation window and stop/rollback conditions.
- Added validation and human-readable rendering so existing frontend action rendering and retrospective storage remain compatible.
- Explicitly label the suggested observation window as guidance only; the existing review queue still waits for its maturity policy and data watermark. It is not falsely presented as a scheduled review.
- Pass the existing owner-scoped action history into final analysis validation. Exact duplicate actions for the same primary metric and source scope are rejected; materially different actions remain eligible. This is deterministic exact-match protection, not semantic duplicate detection.
- Learning strategy contract advanced to `evidence-first-strategy-v4`: includes validity start/end (30-day default), explicit goal/source scope, counter-evidence and rollback instructions.
- Strategy storage reads only v4 policies. The planner ignores expired, future-dated or out-of-scope v4 strategies and returns to default investigation ordering.
- Added regression tests for execution briefs, exact duplicate rejection, strategy validity/scope and counter-evidence.

### Validation boundary

- No database migration, production change, deployment, paid model call, paid collection or external action.
- Existing operation-task workflow is cohort-bound to a cached segment/growth-insights job and a fixed registered-user audience. A generic Growth Agent recommendation cannot safely be converted into that task without an eligible audience snapshot; this bridge remains open rather than fabricating a cohort or creating a parallel task manager.
- Review scheduling still uses its existing three-complete-business-day plus watermark gate; the new suggested observation window is descriptive and does not alter scheduler timing.


### Validation update — 2026-10-31

- Latest successful AI infrastructure run: [41177009626](https://github.com/dinnelthai/logearn-growth/actions/runs/41177009626), head `55494b02cb9f4f298ad615f96fad069b1e15ac6a`.
- AI Contract passed all groups (172 tests, 171 pass, 0 fail; one skipped), and existing groups 41/41, 34/34, 13/13, 23/23, 2/2, 112/112. AI Integration passed 17/17 with real PostgreSQL and Redis service containers. AI Frontend passed.
- The first integration run exposed a legacy v3 strategy fixture; updated it to prove a v4 strategy upgrades from v3 even when the feedback digest is unchanged. Latest run passes.
- Validation is still fixture/service-container validation, not a live LogEarn API/Worker acceptance test.


### Final validation update — 2026-10-31

- Latest successful run: [41177187712](https://github.com/dinnelthai/logearn-growth/actions/runs/41177187712), code head `27604c06ef103880350743723f5351c78d938d90`; all three jobs passed.
- AI Contract: 172 tests, 171 pass, 0 fail, 1 skipped; regression groups 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112. AI Integration: 17/17 with PostgreSQL/Redis containers. AI Frontend: success.
- No live LogEarn source acceptance, migration, deployment, paid model call, paid collection or external action.


## 2026-10-31 — Accepted AI suggestion → existing operation task bridge

### Implemented
- Added owner-scoped `POST /suggestions/:id/link-operation-task`. Only `adopted`, `executing` or `executed` AI suggestions can be linked.
- Added `GET /suggestions/:id/operation-tasks` to retrieve the linked task records.
- The bridge reuses existing SQLite Growth Workspace problem records and `gw_operation_links`; no new table or migration.
- Requires a real existing `operation_tasks` row owned by the same account and an exact match between suggestion source scope and task source scope.
- No cohort, user list, baseline or task is fabricated. Missing task, wrong owner, unaccepted suggestion and scope mismatch are rejected.
- Growth Workspace problem detail now returns linked operation tasks.
- Added tests for idempotency, owner isolation, unaccepted suggestions, nonexistent/wrong-owner tasks, source mismatch and link retrieval.

### Explicit remaining boundary
- The task's fixed audience, baseline, execution history and review endpoint remain canonical in the existing operation-task workflow.
- Linking does not automatically change the AI suggestion to `executed`; the operator must record the actual execution using the existing suggestion status endpoint. Automatic state synchronization and baseline/after-evidence handoff into AI retrospective remain open.
- No database migration, deployment, paid model call, paid collection or external action.

### Validation
- Latest successful CI: [41177929631](https://github.com/dinnelthai/logearn-growth/actions/runs/41177929631), code head `6a96a5c064a78ea08d9580260de18da9c3ffed6e`; AI Contract, AI Integration and AI Frontend all passed.
- AI Contract groups: 172 tests (171 pass, 0 fail, 1 skipped), plus 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112. AI Integration: 17/17. AI Frontend: success.


### Execution-state synchronization follow-up — 2026-10-31

- Operation task PATCH now synchronizes linked AI suggestions: task `in_progress` advances `adopted → executing`; task `done` with a non-empty `result_note` advances `executing → executed`, recording the actual-action note and task completion timestamp.
- Added `POST /:id/sync-ai-suggestions` for retry; it uses the latest task-history note unless a new result note is supplied.
- Cross-database writes are not atomic. Per-suggestion failures are returned as a partial sync result, and link-lookup failures are retryable. Missing optional Growth Workspace link tables safely produce a no-op.
- Added tests for lifecycle transitions, actual-action capture, missing completion notes, retryable link lookup failure and compatibility when workspace tables are not migrated.
- Latest successful CI: [41178355922](https://github.com/dinnelthai/logearn-growth/actions/runs/41178355922), code head `1f0ab05f71b0fd5fef90b77282411102ebb3c5a2`; all three jobs passed. AI Contract: 172 (171 pass, 0 fail, 1 skipped) plus regression groups 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112; Integration 17/17; Frontend success.
- Remaining: the operation-task review's cohort baseline/after-period evidence is not yet projected into the AI retrospective evidence record. The retrospective still uses its existing business-metric review pipeline; do not claim cohort-level causal attribution.


## 2026-10-31 — Fixed-cohort retrospective evidence bridge

### Implemented
- Added `backend/src/ai/growth/operationTaskEvidence.js` to resolve the unique operation task linked to an executed AI suggestion and build a bounded cohort comparison.
- Revalidates owner isolation, source scope and exact match between task completion timestamp and suggestion `executed_at`.
- Uses the same frozen audience and same Hologres snapshot for both windows.
- Baseline: 3–14 complete Bangkok business days ending before task creation.
- Post-completion observation: equal-length window beginning on the first complete Bangkok business day after task completion. The task execution interval is excluded.
- Persists `observeUntil`, time-window anchors, snapshot, aggregate baseline/effect metrics and metric changes in existing retrospective JSON fields. No schema migration.
- Model receives aggregate cohort metrics only; no user IDs or user-level rows. It is instructed to distinguish cohort observation from whole-business/channel movement and not claim causality.
- Explicit statuses: not-linked, ambiguous, waiting, unavailable and available. Incomplete reads and scope/timestamp mismatches cannot be treated as zero.
- Added dedicated CI execution for `operationTaskEvidence.test.js` and `operationTasks.test.js`, plus syntax checks for the new service, retrospective worker and task route.

### Validation
- Successful AI infrastructure CI: [41179371875](https://github.com/dinnelthai/logearn-growth/actions/runs/41179371875), code head `94ef62b9f001b147a46964c89c4cff6b8503b492`.
- AI Contract, AI Integration and AI Frontend all passed.
- Dedicated task/evidence suite: 10/10 passed. AI Integration: 17/17. Contract groups: 172 (171 pass, 0 fail, 1 skipped), plus 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- During validation, CI caught and we fixed: (1) non-async task PATCH handler awaiting lifecycle sync; (2) missing helper export for isolated tests; (3) incorrect escaped numeric-ID regex. The route and regex are now covered by CI.

### Remaining
- Add a separate observational outcome label (observed-supported / observed-contradicted / insufficient) to the learning index, distinct from causal effectiveness. Current retrospective still forces `hasCausality=false`; do not interpret positive before/after movement as causal success.
- No production deployment, paid model call, paid collection, migration or external action.


## 2026-10-31 — Fixed-cohort observational outcome classification and planner feedback

### Implemented
- Added `backend/src/ai/growth/retrospectiveOutcome.js` for v2 observational outcome classification.
- Fixed a material versioning gap: Learning Loop and planner memory previously accepted only retrospective context v1, excluding the new v2 fixed-cohort payload. Both now consume v2 explicitly.
- The classifier uses only the directly comparable metric mapping `active_users → analysis_users`. It requires available cohort evidence, equal requested audience sizes, zero unmatched accounts in both windows and medium/high review confidence.
- Unsupported primary metrics (e.g. `new_users`, `activation_rate`, `d7`, registration activation and trade conversion) are classified as `insufficient`; global metrics are not substituted for fixed-cohort metrics.
- Updated `agentLearning.judgeHistory` and `experienceFeedback.summarizeExperience` to emit/use `observed-supported`, `observed-contradicted`, and `insufficient` without claiming causality.
- Updated `agentStore.feedback` to fetch baseline/effect JSON and `aiRecords.getAnalysisMemory` (including its LATERAL projection) so the next investigation planner receives the cohort evidence.
- Added tests for v2 cohort-supported labels, incomplete coverage, unsupported metric mappings, and planner feedback that refuses to fall back to conflicting global metrics.

### Validation
- Successful AI infrastructure CI: [41180112012](https://github.com/dinnelthai/logearn-growth/actions/runs/41180112012), code head `a8834d5a190eb2784a64b5d955d5d55555d8e305`.
- Contract, Integration and Frontend jobs all passed.
- Dedicated fixed-cohort Learning/Experience suite: 24/24; AI Integration: 17/17; Contract groups: 174 (173 pass, 0 fail, 1 skipped), plus 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.

### Remaining
- Extend direct cohort metric equivalence only when underlying source semantics and SQL support it; do not infer equivalence from similar names.
- Add an end-to-end read-only acceptance using a real owner-scoped task, a real Hologres snapshot and an already-mature post-completion window. This is not covered by offline fixtures/CI.
- No migration, deployment, production collection, paid model call or external action.
