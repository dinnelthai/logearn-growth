# Growth Agent 2.0 — 实施进度日志

All dates use repository commit time / recorded work date. This log is append-only in intent: update progress without erasing prior test outcomes.

## 2026-10-31 — Saved weekly snapshot owner-scoped GET audit + UI (no paid work)

- Code HEAD `384c02c462acb59b3a3316bec54a18fabca28e7e`. Implemented `GET /ai-weekly-reports/:id/snapshot-audit` on existing authenticated `growthWorkspace` router. Reuses `getAnalysisRecord(id, ownerId)` and `auditSavedWeeklyContext()`, returns only status/checks, with `modelCalls:0`, `externalSourceCalls:0`, `liveSourceAcceptance:'not-verified'`; no producer, external read or history mutation.
- Frontend archived weekly report controls now include **检查 v5 快照（只读）** and a bounded boolean-only explanation. Historic v4/12-module reports remain explicitly invalid for saved v5 readiness; no automatic regeneration or billing.
- AI Contract regression covers owner isolation, non-weekly denial, historical v4 rejection, malformed stored JSON safety, positive 13-module v5 fixture; frontend regression covers proper status display and absence of raw data. New suites wired into workflow.
- [AI infrastructure 41207439675](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439675): **Contract/Integration/Frontend passed**. Separate [full Frontend UI 41207439672](https://github.com/dinnelthai/logearn-growth/actions/runs/41207439672): **failed** with unrelated `funnelAssociation.test.js` drop-off expectation mismatch; not repaired in this scoped pass.
- Read-only browser shows existing **aggregated-business-v4 / 12** report; genuine v5 reporting and real Hologres watermark/identity/transaction matches not verified. **Checklist 47/48 (97.9%), last Phase 1 live acceptance remains open.** No paid model runs, migrations, deployments, source syncs or `master` changes.
## 2026-10-31 — Offline v5 saved-context acceptance guard (branch continuation)

- Base HEAD inspected: `5b957a1b10e27fb5f648b01c9e08622e046d3791`; branch remains `codex/ai-comprehensive-upgrade`, without merge into `master`.
- Added `src/ai/business/savedContextAudit.js`, `scripts/auditSavedWeeklyContext.js`, and `test/aiSavedContextAudit.test.js` in backend. They reject v4/12-module or missing saved-v5 marker, validate projected Business Brain and 22KB, and emit only status booleans without raw evidence. No database/Worker/model network activity.
- Added `docs/ai/GROWTH_V5_SAVED_CONTEXT_AUDIT.md` describing safe, no-paid manual evaluation of an **already saved** authorized context and what is still necessary to close Phase 1.
- Read-only local browser observation: existing selected 2026-10-19 to 2026-10-25 report is an archived v4/12-module report with unknown historical completeness and a failed trade read. Not a v5 model validation.
- Follow-up CI gate: `.github/workflows/ai-infrastructure.yml` explicitly runs `backend/test/aiSavedContextAudit.test.js` in AI Contract; prior commit's initial CI did not exercise this new test.
- **Progress remains 46/48 (95.8%); Phase 1 two open.** This is acceptance tooling, not verified real-source or operator signoff. New CI outcome is pending; do not describe this commit as tested green before checking GitHub Actions.
### Follow-up verified CI result

- `0d3b508cb654e47352f8aa2926f1ba8b8b662e6c`: [AI infrastructure run 41205481012](https://github.com/dinnelthai/logearn-growth/actions/runs/41205481012) **passed** all three jobs — Contract (including the new saved v5 audit), Integration and Frontend.
- This is an isolated contract/regression and service-container result. The 46/48 checklist remains unchanged; live-source validation and operator signoff remain open.
## 2026-10-31 — North Star operator signoff and Business Brain alignment

- Confirmed directly with operator: a viewer of Chip Distribution counts as an effective analysis user; each observed user counts once per reporting interval regardless of repeated analyses.
- Existing source mapping (`chip_analysis_viewed`, `chip_analysis_drilldown` → `active_users` distinct `user_key`) is preserved. No changes to historical SQL, metric registry, previously billed tasks or saved reports. Live source coverage remains unverified.
- Real trading metrics are supporting outcome indicators, not North Star components; no North Star analysis→trade window is specified. Retain independent historical registered-user 7-day trade-conversion semantics.
- Trades lacking reliable user identity are excluded from verified user-linked outcomes and recorded as matching anomalies / unknown association coverage, not described as zero trades.
- Updated Business Brain v2 operator metadata, activation-oriented question priority, unit tests and handoff/source contracts. **47/48 (97.9%) roadmap**; only genuine read-only v5 context/source acceptance remains. New code CI result requires separate verification.
- No paid calls, external source sync, migrations, deployment, or `master` merge.
### Verified CI and correction trail

- Initial North Star code CI (`72dd38a...`) failed one *stale priority-order test*, not the owner-approved business decision. Updated test to expect `active_users` first.
- Next CI (`863e51b...`) exposed an existing explicit finance-guard assertion; restored `合作账本不是平台收入` wording rather than dropping the guard.
- Third CI (`6ba4927...`) detected weekly v5 model context over 22KB after the new policy; raised reserved headroom for the pre-existing optional context compactor, not the hard model byte limit.
- Subsequent CI (`dce6f48...`) detected a stale weekly-context priority expectation; changed the test to require `active_users` as the top goal-relevant positive signal while preserving `new_users` separately.
- **Final source/test commit `d678cf51af6257a250777c52708586448bba5ff0`; [GitHub CI 41206755515](https://github.com/dinnelthai/logearn-growth/actions/runs/41206755515) passed AI Contract, AI Integration and AI Frontend. This is source/fixture validation, not live Hologres or paid model acceptance.
- **Progress: 47/48 (97.9%)**, Phase 1 real source/context gate remains open. Existing unmatched-identity observations can be marked unknown/anomalous, but a complete source-verified anomaly count and event mapping have **not** been accepted.
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


### Learning outcome visibility — 2026-10-31
- Growth Agent Control now displays all three observational outcome counts: observed-supported, observed-contradicted and insufficient.
- Added an explicit explanation that the labels describe fixed-cohort before/after movement, not causal impact; only the directly comparable active-user metric currently contributes to v2 labels.
- Frontend UI CI [41180322912](https://github.com/dinnelthai/logearn-growth/actions/runs/41180322912) passed.


### Recent learning evidence detail — 2026-10-31
- `GET /growth-agent/learning` now returns the latest 10 owner-scoped judgement records in addition to aggregate assessment and strategy versions.
- The learning projection includes bounded business-problem/action labels, metric and aggregate evidence; it never returns frozen cohort member IDs.
- Growth Agent Control now renders the latest operation, metric, observational label, baseline → effect and fixed audience count, with all dynamic text escaped.
- Backend CI [41180441759](https://github.com/dinnelthai/logearn-growth/actions/runs/41180441759) passed all AI Contract, Integration and Frontend jobs. Frontend UI CI [41180467339](https://github.com/dinnelthai/logearn-growth/actions/runs/41180467339) passed.


## 2026-10-31 — Action anti-repeat and insufficient-review learning

### Implemented
- `experienceFeedback.summarizeExperience` now preserves recent action-level lessons (up to three per metric), including bounded business problem, actual action, observational label and reason.
- v2 `insufficient` reviews are retained in the learning feedback rather than silently omitted. This allows the planner to ask for missing evidence without treating the action as disproved.
- Planner experience checks carry the prior action details. Contradicted actions are not to be repeated as-is; any revisit requires a changed hypothesis/mechanism and new evidence. Insufficient reviews require evidence completion or a materially changed intervention.
- Investigation attention weights contradicted reviews more strongly than insufficient reviews.
- The analysis contract rejects exact normalized action duplicates against both the original proposal and recorded actual action, scoped to primary metric and source. Fuzzy matching is intentionally avoided to prevent false positives.
- Tests cover action-level prompt guidance, insufficient review behavior and exact duplicate rejection against actual executed action.

### Validation
- CI [41181045783](https://github.com/dinnelthai/logearn-growth/actions/runs/41181045783) completed successfully: AI Contract, AI Frontend and AI Integration all passed.
- Contract test groups: 177 tests (176 pass, 0 fail, 1 skipped), plus 26/26, 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- No schema migration, deployment, production collection, paid call or external write.


## 2026-10-31 — Reviewable metric and complete action-plan contract

### Implemented
- Added `backend/src/ai/growth/reviewMetrics.js` as the shared source for the metrics the current retrospective job can directly reconstruct: `active_users`, `new_users`, `returning_users`, `activation_rate`, `d7`.
- Extracted the retrospective value projection into `buildRetrospectiveValues`; the actual retrospective job now uses it. The metric registry derives its `reviewAdapter` from the same map and checks that its declarations remain in sync.
- Corrected false reviewability declarations: `registration_activation_rate` and `registered_trade_conversion_rate` remain valid business metrics but are not yet computable by the current retrospective service; `registered_users` is also not directly reviewable there. New suggestions cannot use these as primary or secondary review metrics until a real direct-read path exists.
- Versioned the new output contract as `analysis-contract-v2` and pinned it into newly created analysis snapshots. New suggestions require supported review metrics, a complete structured execution plan, expected-impact basis, exact source scope and non-empty review conditions.
- Archived snapshots without the v2 marker keep legacy validation, preserving finalization/recovery compatibility.

### Validation
- CI [41182874411](https://github.com/dinnelthai/logearn-growth/actions/runs/41182874411) passed AI Contract, AI Frontend and AI Integration.
- Contract groups: 177 tests (176 pass, 0 fail, 1 skipped), plus 26/26, 16/16, 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- No database migration, deployment, live data collection, paid model call or external write.


## 2026-10-31 — Discriminating-query validation

- New strict analysis-contract-v2 suggestions must use genuinely distinct root-cause hypotheses.
- Each hypothesis's discriminating query must use a capability in the current task, and its input must match that capability's input schema. The query source must match the task source and its date range must remain inside the task's authorized period. `query_metrics` metric IDs are validated against the formal metric registry.
- Validation is strict-v2 only; archived contexts without the v2 marker preserve legacy recovery compatibility.
- CI [41183309528](https://github.com/dinnelthai/logearn-growth/actions/runs/41183309528) passed all three AI jobs. Contract groups: 177 (176 pass, 0 fail, 1 skipped), plus 26/26, 19/19, 41/41, 34/34, 13/13, 23/23, 2/2 and 112/112.
- The "cheapest query" ranking remains intentionally open because trusted per-tool scan/latency cost metadata does not exist; do not invent estimates or claim cheapest. No paid call, migration, deployment, live-source collection or external write.

## 2026-10-31 — Implementation-status reconciliation at code HEAD 030c0ed

### Scope / source of truth

- Branch only: `codex/ai-comprehensive-upgrade`; no comparison, merge or commit to `master`.
- Audited code HEAD before documentation changes: `030c0ed8993a049485f4a064d48cef1f661dfa05` (weekly UI finishing commit). Read the live branch ref before future work because documentation updates advance HEAD independently.
- Canonical checklist remains `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md`: **37 of 48 implementation items checked (77.1%); 11 open**. Previous `35/48` was stale. This count covers code with test/CI evidence, **not** production or real-model acceptance.
- Phase counts: Phase 0 5/5; Phase 1 8/10; Phase 2 2/8; Phase 3 7/8; Phase 4 4/6; Phase 5 5/5; Phase 6 6/6.

### Why Phase 5 changed from 3/5 to 5/5

1. **Business-first weekly report contract and display.** `backend/src/ai/growth/weeklyReport.js` defines a new v5 `weeklyReportContractVersion='weekly-report-v2'` schema covering seven lifecycle stages, evidence-linked positive growth opportunities, prior-action states/reviews and partial fallback. `backend/src/queues/jobs/businessAnalysis.js` pins that schema for newly created v5 weekly snapshots. `frontend/src/pages/aiWeeklyDecisionView.js` renders lifecycle/opportunities/previousActions alongside priority, metrics, acquisition, next steps and gaps. `backend/test/aiWeeklyReport.test.js` covers required stages, evidence checks and explicit partial fallback, and frontend tests cover UI ordering.
2. **Secondary/collapsible module audit.** `frontend/src/pages/aiWeeklyDecisionView.js` renders module coverage, data completeness and technical evidence under `<details>`; `frontend/src/pages/aiWeeklyReportPanel.js` opens the relevant collapsed area for jump navigation. UI regression tests cover these surfaces.

These are **code-complete/CI-validated**, not a guarantee that an actual new v5 report has been generated and accepted from live sources. An archived v4 report is not a v5 regression test. Strict v5 malformed model sections become an explicitly partial saved report; no blind second paid request.

### CI evidence and checks not performed

- Latest observed successful AI infrastructure run: [41184069508](https://github.com/dinnelthai/logearn-growth/actions/runs/41184069508), code HEAD `76ec311df688860f93b72b930641cf1c3cd3ef03`, successful after intermediate failed attempts at earlier commits.
- Latest observed successful Growth desktop UI regression: [41184123727](https://github.com/dinnelthai/logearn-growth/actions/runs/41184123727), exact audited code HEAD `030c0ed8993a049485f4a064d48cef1f661dfa05`.
- This was a **remote code/document inspection and GitHub CI-history review**. No new tests were run locally in this documentation pass, and there was no live Hologres/Worker/API acceptance, new paid model invocation or live collector verification.

### 11 remaining roadmap items (original checklist IDs by phase)

- **Phase 1 (2):** read-only real v5 context verification; operator confirmation of product map and formal North Star.
- **Phase 2 (6):** complete business module source-contract audit; registration/activation/product engagement/trade journey with verified denominators; GSC/X/KOL/referral time and source contracts; supported channel/product/cohort splits; per-metric watermark/freshness/coverage/definition version; platform revenue vs trade volume/partner ledger.
- **Phase 3 (1):** stable identity-and-window activity-to-channel/mature-outcome links; existing KOL record links are operational associations, not proven incremental acquisition.
- **Phase 4 (2):** objective/impact/evidence/confidence **and measured query-cost** ranking; competing-hypothesis cheapest authorized discriminating query. Query safety/schema checks are implemented, but trustworthy tool scan/latency cost metadata is missing. No costs should be invented.
- **Phase 5 (0 checked open):** real model/business-quality signoff still pending *outside checklist*, regardless of 5/5 code status.
- **Phase 6 (0 checked open):** real fixed-cohort end-to-end signoff still pending *outside checklist*; only `active_users → analysis_users` is directly comparable in cohort v2 learning.

### Identified source debt (not added as unchecked roadmap item)

- `frontend/src/pages/aiWeeklyDecisionView.js` has a hardcoded “12 个增长模块” label, while the new v5 coverage catalog has **13** with operations-timeline. UI label should read a manifest-backed count in a future code-only patch. Avoid equating archived 12-module reports with the new manifest.
- Full model truthfulness and quality, real transaction match rates/latency, mature funnel event coverage, GSC Pacific-Time window alignment, X/KOL freshness and verified revenue are not established by unit/integration fixtures.
- The retrospective service can calculate `active_users`, `new_users`, `returning_users`, `activation_rate` and `d7`, but the fixed-cohort v2 observational outcome mapper only supports `active_users → analysis_users`; the others must not be counted as proven cohort learning.

### Files changed / operational safety

- Documentation-only paths: `docs/ai/GROWTH_AGENT_2_0_IMPLEMENTATION_PLAN.md`, `docs/ai/GROWTH_AGENT_HANDOFF.md`, `docs/ai/LOGEARN_BUSINESS_BRAIN.md`, `docs/ai/GROWTH_AGENT_UPGRADE_LOG.md`.
- No application source or tests were changed; no database migration, deployment, paid AI call, paid SEO collection, external posting, or external campaign occurred.
- Next priority: Phase 2 source-contract completion with authorized read-only fixtures/live acceptance, then Phase 3 stable outcome associations, then cost-aware Decision Engine only when trusted cost metadata exists. Keep all real paid operations approval-gated.


## 2026-10-31 — Phase 2 per-metric provenance and weekly 13-module UI correction

### Baseline and changed files

- Branch: `codex/ai-comprehensive-upgrade`. Feature/test verification HEAD `f9de3abb5eae27be99ba9129ee92c8b57a318a03`. Previous audited checklist: **37/48 (77.1%)**.
- `backend/src/ai/business/tools/adapters.js`: metric-specific `coverage.status/reason` for registered users, registration activation, verified user-level post-analysis trades, weekly core and event-observed metrics; retain conservative source freshness limits.
- `backend/src/ai/business/tools/registry.js`: **fix evidence warning overwrite** in `query_metrics`; keep metric-specific warnings plus shared warnings, per-metric coverage, owner scope and formal definition version. `events` watermarks are used only for event-based metrics; registration/trade watermarks are null unless separately measured. No fabricated freshness.
- `backend/test/agentTools.test.js`, `backend/test/aiBusinessMetricsAdapter.test.js`: add independent registration/trade availability, observed zero vs unknown, evidence warning/watermark/scope regression tests.
- `frontend/src/pages/aiWeeklyCoverageView.js`: use the saved, bounded `weekly-coverage-v1` module manifest to show the 13th `operations-timeline` row; historical reports without an updated manifest keep 12 legacy modules.
- `frontend/src/pages/aiWeeklyDecisionView.js`: derive collapsed module count from real rendered coverage.
- `frontend/src/pages/__tests__/aiWeeklyDecisionView.test.js`: explicit 12/13 compatibility regressions.

### Validation

- [AI infrastructure run 41184881554](https://github.com/dinnelthai/logearn-growth/actions/runs/41184881554) on `f9de3abb5eae27be99ba9129ee92c8b57a318a03`: **success**, AI Contract / AI Frontend / AI Integration all passed. Earlier incremental AI runs 41184836223, 41184852478 and 41184867049 also passed.
- [Growth desktop UI run 41184785074](https://github.com/dinnelthai/logearn-growth/actions/runs/41184785074) on `82f801864ff1cf4c6d114b77411adbfdb5527911`: **success**.
- These are GitHub-hosted CI runs. No new local checkout or local Node test was run by this agent; no real Hologres, Worker, paid model or independently synchronized source was exercised.

### Checklist result and next action

- The broad Phase 2 item “Keep source watermark, coverage, freshness, scope and definition version with **each** metric” remains **unchecked**: the new code improves `query_metrics`, but comprehensive per-specialty source freshness and live-watermark acceptance remain open.
- Corrected historical 12-module display is an off-roadmap compatibility bugfix, not a new implementation checkbox.
- **Checked 37/48 (77.1%); open 11; Phase 2 2/8.** Do not inflate the completion score for passing a subset of a broader requirement.
- Next: audit remaining data source contracts for authentic watermarks, time zones, coverage and mature denominators; align source-safe registration→parallel product engagement→verified trade cohort views and keep revenue/partner ledger separate.
- No database migration, schema change, deployment, paid collection, external publishing, production configuration change or model request.

## 2026-10-31 — Phase 2 platform revenue vs CRM/KOL collaboration ledger (38/48)

### Source/contract correction

- The previous `get_channel_economics` evidence ID `trade_revenue` represented manual CRM collaboration costs and receipts rather than verified platform trading income. That semantic collision could mislead v5 reports and finance analyses.
- The current tool now issues **`collaboration_economics` v1** evidence, with the existing owner-scoped CRM/KOL ledger and per-currency limited summary. The `revenue` weekly coverage module remains addressable for old reports but now labels the new source “合作账本（非平台收入）”.
- **`trade_revenue` v2** is a distinct formally registered `platform-revenue-unavailable` metric. No direct platform fee/income data source has been integrated. Historical v1 `trade_revenue` evidence is not migrated, overwritten, or silently reclassified.
- Business Brain incremented from `logearn-business-brain-v1` to **`logearn-business-brain-v2`** and metric dictionary version `2`. The revenue goal, metric labels, lifecycle and concise operating rules explicitly separate platform income (unknown), manual cooperation ledger and real trade amount/volume. Archived v1-v4 transport contexts are unaffected; new v5 inputs still respect **22KB**.
- Implementation files: `backend/src/ai/business/metricRegistry.js`, `backend/src/ai/business/tools/registry.js`, `backend/src/ai/business/tools/businessModuleCatalog.js`, `backend/src/ai/business/businessBrain.js`, `backend/src/ai/growth/weeklyCoverage.js`.
- Regression tests: `backend/test/agentTools.test.js`, `backend/test/aiBusinessBrain.test.js`, `backend/test/aiWeeklyModuleSummaries.test.js`, `backend/test/aiWeeklyContextV4.test.js`. Tests cover independent metric identity and version, ledger-only evidence, suppressed decimal money conversion, absence of invented platform fees, schema/authorization, historical v4 boundaries and 22KB context size.

### CI evidence and correction sequence

- Initial intermediate builds failed when Business Brain v2 expanded past the 22KB limit, then when a test referenced the pre-compression wording of an operating rule. Both were corrected by shortening repeated dictionary excerpts/operating rules and updating the version/semantic assertions. **The context byte cap was not increased and raw data/evidence was not dropped.**
- Final source/test HEAD: `ac7b5a410211bb257033943a729ad852e0d16fb8`.
- [AI infrastructure CI run 41185478559](https://github.com/dinnelthai/logearn-growth/actions/runs/41185478559): **success** for AI Contract, AI Integration and AI Frontend. This is GitHub CI with fixtures/service containers, not a live source or paid model end-to-end acceptance.
- No migration, deployment, new paid model invocation, external sync/write, production configuration change or platform revenue ingestion.

### Updated task accounting

- Phase 2 checkbox “Separate platform revenue from trade volume and partner/collaboration ledger records”: **completed at code/CI contract level**. It does NOT mean verified platform revenue data is available; that data remains unknown until a direct source is designed, connected and accepted.
- Phase 2 now **3/8**; entire 48-item roadmap **38/48 = 79.2%**, **10 unchecked**. Remaining Phase 2: module source-contract audit; mature funnel/event completeness; GSC/X/KOL/referral time semantics; supported channel/product/cohort splits; per-metric source watermarks/freshness across all skills. Cross-source real Hologres/Worker/model acceptance remains separate.

## 2026-10-31 — Phase 2 source-date and historical snapshot evidence (39/48)

### Findings and implementation

- **Historical X account followers could include future captures.** `get_content_growth` previously selected `x_official_follower_daily` by its Bangkok day string only, without checking `observed_at`; reports ending before the actual collection could display followers learned later. Fixed in `backend/src/ai/business/tools/contentAdapters.js` with strict `observed_at < period.end`.
- **Historical X follower audit could inherit later state.** A mutable `x_follower_progress` row might show `complete` although it was updated after report cutoff; now only latest states with `updated_at < period.end` are shown. The mutable audit row's post-classification timestamp is considered: if `posts_at >= end`, historical category becomes `unknown` and analyzed count excludes it. `reviewed` is only a boolean without `reviewed_at`, therefore historical reviewed count cannot be recovered.
- **Model summary could invent zero historical manual reviews.** `backend/src/ai/business/tools/weeklyModuleSummaries.js` now omits reviewed metrics when source values are unknown, instead of `SUM([]) = 0`. It still preserves actual independently observed zero/numeric review counts where a trusted source can provide them.
- Owner-scoping and read-only behavior preserved. Legacy saved evidence is not rewritten, source data is not migrated and no paid API collector is called.

### Source test gate and verified scope

- Added regression fixtures: `backend/test/contentAgentEvidence.test.js`, `backend/test/xContentAgentEvidence.test.js`, `backend/test/aiWeeklyModuleSummaries.test.js`.
- Updated `.github/workflows/ai-infrastructure.yml` to run all of `contentAgentEvidence`, `xContentAgentEvidence`, `aiWeeklyModuleSummaries`, `gscWeeklyWindow`, `growthKolReader`, `inviteAssociation`, `inviteRegistration`, and `referralInsights` in the **required AI Contract CI job**. This validates GSC PT-date completeness, saved X observation cutoffs, owner KOL CRM/Hologres watermark, verified invitation binding, referral periods and no ungrounded conversion.
- Source/test HEAD `14f42ba61c785866e918df3ca841bf4525f35bc2`; [AI infrastructure 41185823229](https://github.com/dinnelthai/logearn-growth/actions/runs/41185823229) **successful** for AI Contract, AI Integration and AI Frontend.
- New detailed source matrix: `docs/ai/GROWTH_SOURCE_CONTRACTS.md`. Contains explicit live-acceptance gates, scopes, maturity and non-attribution limits. The contract gate is offline; no real business/Google/X/Hologres read, actual completed trade matching, paid model response or production run is claimed.

### Progress accounting and remaining work

- Original Phase 2 checklist task “Validate SEO/GSC date semantics, X snapshot semantics, KOL CRM association and referral/invite contracts” is now **checked at code+CI contract level**. This does not mark real third-party collector freshness, registration linkage or production coverage as accepted.
- **Overall 39/48 (81.3%); 9 unchecked; Phase 2 4/8.** Remaining Phase 2: exhaustive module source contract audit; mature registration→activation→multiple product engagement→verified trade coverage; source-supported cohort/channel/product breakdowns; independent watermarks/freshness/version/scope per metric. The separate live-read acceptance and operator approval still require authorization.
- No deployment, DB migration, schema change, paid model calls, paid third-party collection, external post or branch merge.

## 2026-10-31 — Phase 2 specialist provenance propagation and independent CRM ledger

### Bug and implementation

- The Agent tool registry previously used a generic Hologres event `snapshot.as_of` as source watermark for multiple unrelated specialist tools, and populated `watermarks.searchConsole` from `safe.importedAt`. The API GSC adapter actually supplies `syncedAt`, while the model-safe `statView` projection can remove import timestamps; the resulting formal evidence gave incomplete/misleading source provenance.
- Added `specialtyProvenance(id,rawPayload,snapshot)` to `backend/src/ai/business/tools/registry.js`. It extracts only validated, bounded source metadata from the authenticated read-only adapter before statistics projection and builds per-source versions/watermarks. GSC API uses `snapshotId/syncedAt`, manually imported GSC uses `snapshotId/importedAt` (not Google verified freshness); X official sampled posts use recorded account observation timestamps, not day-increment or all-account currency; follower-scan uses actual update timestamp where available; KOL observed stats use its own remote snapshot/asOf only when available. Missing timestamps remain null.
- The owner-scoped manual CRM/KOL ledger `get_channel_economics` now has `sourceVersions.operatorRecords='crm-manual-collaboration-ledger'`, `watermarks.operatorRecords=null`, `watermarks.events=null`, and does **not call Hologres status** because that data is local CRM, not event analytics. This fixes an unrelated event-source outage making local accounting unavailable.
- `backend/src/ai/business/modelTransport.js` now allows the measured GSC/X/KOL/followerScan provenance to be projected into model-visible evidence, and not arbitrary unknown source fields. Historical evidence is not rewritten, raw/user-level records remain excluded, and no source has a fabricated complete-through watermark.
- The only changed runtime paths are `backend/src/ai/business/tools/registry.js` and `backend/src/ai/business/modelTransport.js`. No changes to Growth's underlying analytics SQL or calculated KPI semantics.

### Tests and CI

- Added `backend/test/growthSpecialistTools.test.js` cases for API-vs-manual GSC timestamps, X bounded post observation, KOL snapshot, follower scan progress, null provenance when source absent, and strictly bounded model projection.
- Extended `backend/test/agentTools.test.js` to confirm collaboration economics evidence is not falsely stamped with Hologres freshness, and that local CRM ledger continues to report owner-scoped read-only aggregates while Hologres health is unavailable.
- Final implementation/test HEAD `8a7f71c98fce502b68a056671ee9a95304507abb`; [GitHub Actions AI infrastructure 41186244825](https://github.com/dinnelthai/logearn-growth/actions/runs/41186244825) **passed AI Contract, AI Integration, AI Frontend**. This is CI fixture/container validation, **not** verification of actual live source freshness, Hologres trade matching, revenue data, Worker or paid model behavior.

### Checklist / remaining scope

- **39/48 (81.3%) stays unchanged; 9 open; Phase 2 4/8.** This closes a demonstrable *subtask* under the unchecked per-metric source watermark/coverage/freshness/scope/version item. It does **not** complete comprehensive provenance for compound referral, invitation, product/trade, manual CRM membership or real-source acceptance.
- `docs/ai/GROWTH_SOURCE_CONTRACTS.md` documents the per-tool metadata contract and limits.
- Next: inspect every remaining compound module against independent source watermarks, preserve scope and mature cohort denominators end-to-end, accept source-supported channel/product/cohort dimensions, then use only authorized real read-only data for acceptance.
- No deployment, schema migration, paid AI/API call, external sync or posting, or merge to another branch.

## 2026-10-31 — Registration → activation → parallel product engagement → trade journey (40/48)

### Implemented

- Added formal `registered_user_journey` aggregate metric to `backend/src/ai/business/metricRegistry.js` and its business definition to `backend/src/analytics/businessPriorities.js`. The existing `growth-overview` skill now requests it through `query_metrics`; no new analytics engine, event collector or parallel funnel SQL was introduced.
- `backend/src/ai/business/tools/adapters.js` builds one bounded, statistics-only journey from the existing `growthInsights` payload:
  1. **Registration:** owner-scoped `account_v2.created_at` cohort.
  2. **Activation:** first chip analysis within 24 hours; only mature registration accounts enter denominator, pending accounts remain separate.
  3. **Parallel product engagement:** chip analysis, Holder view, strategy start, signal view and repeat analysis in the first seven days after registration. Every entry shares the same mature seven-day registration denominator; entries can overlap and are never summed as a serial funnel.
  4. **Trade conversion:** separate 168-hour window after first chip analysis; only mature users with verified account identity enter denominator; unmatched identities remain separately counted. This is user-level any-token trade observation, not same-token attribution or causal proof.
- Source completeness is explicit: event `historyComplete` and `eventsCompleteThrough` pass through when supplied. Registration and trade watermarks remain null until independently measured. The evidence's event snapshot applies only to event behavior, not as a substitute registration/trade watermark.
- `registered_user_journey` does not advertise device/version group-by; registry rejects unsupported dimension requests. Existing source and fixed-audience scopes remain governed by existing authorization.
- `backend/src/ai/business/modelTransport.js` allowlists the nested registration/activation/engagement/trade aggregate and preserves it in compact weekly evidence without exposing user rows or identifiers. `backend/src/ai/growth/weeklyCoverage.js` prioritizes activation, the parallel product entries and trade facts.
- No new schema, SQL collector, external service or paid integration.

### Regression and CI

- Added cases in `backend/test/aiBusinessMetricsAdapter.test.js` for 24h/7d maturity, parallel rates, true zero vs null, unknown trade and registration unavailability.
- Added `backend/test/agentTools.test.js` for immutable evidence projection, independent source watermarks and rejection of unsupported dimensions.
- Added `backend/test/aiWeeklyCoverage.test.js` for safe model projection and the twelve bounded journey facts.
- Existing `backend/test/growthInsights.test.js` and `backend/test/growthCohortTrades.test.js` cover underlying cohort windows, identity mapping, maturity and transaction boundaries.
- **Source/test HEAD:** `a4f421400160d1a895e5032d7614062946e6f731`. [AI infrastructure CI 41187724624](https://github.com/dinnelthai/logearn-growth/actions/runs/41187724624) passed **AI Contract, AI Integration and AI Frontend**.

### Checklist and remaining limits

- Phase 2 registration journey checkbox is now complete at code/fixture level. **Overall 40/48 (83.3%), 8 open; Phase 2 5/8.**
- This is not live-source acceptance. Event-history completeness may be false; the flag is surfaced, not asserted. Independent registration/trade freshness, complete identity mapping and actual production Hologres coverage still require authorized read-only verification.
- Remaining Phase 2: audit every business module/source contract; add only source-supported channel/product/cohort breakdowns; finish independent per-metric watermark/coverage/freshness/scope/definition-version coverage.
- No paid model/API calls, migrations, production deployment, external collection, posts or writes.

## 2026-10-31 — Registered cohort trade attribution window boundary

- **Root issue:** The registration engagement cohort explicitly counted product entries only within seven days of account creation, but registered trade conversion accepted a first chip analysis at any later time (as long as followed by seven mature trading days). This let a day-8 first analysis join a day-0 registration cohort trade metric, making the registration/product/trade story internally inconsistent.
- **Fix:** `backend/src/analytics/growthInsights.js` now requires first analysis in `[registered_at, registered_at+7*DAY)` for the registered trade subset while preserving `[first_chip_at, first_chip_at+7*DAY)` as the distinct fully mature follow-up. `backend/src/data/growthInsights.js` applies the same first-analysis eligibility to bound Hologres trade lookup windows; other channel/first-observed journeys retain their previous semantics.
- **Regression:** `backend/test/growthCohorts.test.js` proves the exact day-seven boundary and excludes late users from engaged, eligible, trader and conversion rates; `backend/test/growthCohortTrades.test.js` confirms the remote trade lookup does not include out-of-window accounts.
- **Validation:** source/test HEAD `a0a7f210ad28dc710062b5907255eacfa1ddceca`. [AI infrastructure 41191137847](https://github.com/dinnelthai/logearn-growth/actions/runs/41191137847) **success** for Contract, Integration and Frontend. This is fixture CI; real external Hologres, actual model reasoning and trade identity coverage were not exercised.
- **Progress:** This fixes a correctness boundary within the recently completed registered-user-journey checkbox, not a distinct roadmap deliverable. Keep **40/48 = 83.3%, 8 open**. No DB migration, deployment, paid service/model call, external collection or branch merge.

## 2026-10-31 — Phase 2 bounded observed-source cohorts (41/48)

### Source contract / implementation

- A new opt-in `query_metrics` dimension `['source']` is supported **only for** the single registered-user-journey metric. It groups already present `public.account_v2` registered accounts by their **observed analytics source association** in `registrationFacts`; it is not a historic first-touch channel or causal acquisition record.
- `backend/src/analytics/growthCohorts.js`: ranks up to four safe named source labels, preserves an explicit `unknown` source, combines other/untrusted/overflow values into `other`. All group counts are from the same registration rows and reconcile with the overall account count and 24-hour / 7-day mature cohorts. Each group includes separate chip/Holder/strategy/signal/repeat activity, recognizing overlaps and preserving pending/unobserved vs true zero.
- `backend/src/ai/business/metricRegistry.js`: only `registered_user_journey` now advertises supported source dimensions. Other metrics and unsupported device/version dimensions are rejected before running query work, instead of accepting and silently ignoring group dimensions.
- `backend/src/ai/business/tools/registry.js`: validates exact single-metric/source dimensions and **records `dimensions` in the same archived query body and fingerprint used for execution**; this was caught by a new regression after an intermediate CI failure.
- `backend/src/ai/business/tools/adapters.js`: only explicit source-grouped journeys project `registration.bySource`, with per-group maturity and product counts. No fabricated source-level transaction conversions; overall identity-verified trade outcome is unchanged.
- `backend/src/ai/growth/weeklyCoverage.js`: source-grouped journey evidence reserves citeable numeric source facts under the 12-fact budget; overall ungrouped report evidence stays unchanged and does not surface group data unless requested. No identities or raw event/member records go to the model.

### Regression / CI

- Added or extended `backend/test/growthCohorts.test.js`, `backend/test/aiBusinessMetricsAdapter.test.js`, `backend/test/agentTools.test.js` and `backend/test/aiWeeklyCoverage.test.js` for mature denominators, overlapping source/product entries, unclassified/overflow bucket, no leaked raw labels/user IDs, unsupported dimensions, archival query fields, zero vs unknown and citeable bounded source facts.
- Early intermediate CI failures were corrected: the test object had an extra closing bracket; its evidence assertion initially read `query.dimensions` rather than `query.body.dimensions`; the latter revealed a real missing field in the registry evidence body, now fixed.
- **Final source/test HEAD:** `7044ef3859c551002f543c0d8d178cbd142877dc`. [AI infrastructure 41198640425](https://github.com/dinnelthai/logearn-growth/actions/runs/41198640425) **all jobs success** (AI Contract, Integration, Frontend).

### Updated checklist

- Checked Phase 2 `Add channel / product / cohort breakdowns only where the source supports them` at **code + fixture CI** level. This covers source-supported observed registration groups with existing per-product parallel entries and a mature registration cohort; it does not assert historical acquisition attribution, per-source trade identity coverage or live Hologres completeness.
- Phase 2 **6/8**; roadmap **41/48 (85.4%)**, **7 open**. Remaining Phase 2: comprehensive per-module/source-contract audit and full source-specific freshness/coverage/definition metadata validation. Remaining cross-phase items require real operator acceptance, stable activity-to-outcome identifiers or measured query-cost metadata.
- No paid AI/API call, schema migration, deployment, external sync/write, publication or `master` merge.

## 2026-10-31 — Phase 2 complete built-in source contract audit (42/48)

### Source inventory and observed defects

- `backend/src/ai/business/tools/sourceContracts.js` introduces a static source/clock/interpretation contract for **every one of the 18 built-in tool IDs**. It does **not** claim external source connectivity. `backend/src/ai/business/tools/businessModuleCatalog.js` now exposes source contracts in discovery and execution of the 9 existing module facades. Modules no longer call all non-SEO sources `logearn_business_observation`; manual collaboration CRM, cumulative referral, public X samples, observed event cohorts and relationship-linked conversion are distinguishable.
- **Coverage inflation fixed:** `conversionSummary()` formerly set `coverage.status='verified'` if `history_complete` was true, while the underlying invited-account and verified-binding association sources might still be unavailable. The coverage is now `partial`, with event `historyComplete` separated; no unsupported claim of full relationship/terminal completeness is made.
- **Model evidence boundary fixed:** `backend/src/ai/business/modelTransport.js` `statView` now retains sanitized aggregate `association.available/status/reason` objects so AI can see linkage gaps in invite conversion, but arbitrary relationship rows, IDs, wallets and user-level fields are still discarded.
- **Unchanged:** existing Growth analytics SQL/metric semantics, authorization and owner scoping, source collection schedules, historical stored evidence, 22KB model context budget and paid call permissions.

### Verification

- `backend/test/businessModuleCatalog.test.js` checks **18/18** source catalog vs actual `registry.listToolIds()` with no missing or unexpected tools, verifies trusted source labels and clocks, and confirms module-visible source contracts for observed sources/GSC import.
- `backend/test/agentTools.test.js` proves that true event-history completeness cannot make invite/binding coverage verified, and that unknown association and registration status remain visible in archived statistical evidence.
- Source/test HEAD `1f6ca609ac864cb3877208136e8e9c8dae29ddae`. [GitHub AI CI 41199595293](https://github.com/dinnelthai/logearn-growth/actions/runs/41199595293) **success** for AI Contract, AI Integration and AI Frontend. Earlier intermediate run exposed an association positive-allowlist omission; fixed before this passing source/test HEAD. CI is code/fixture validation, not real Google/X/Hologres/model access.
- `docs/ai/GROWTH_SOURCE_CONTRACTS.md` now provides a full source/tool/time/limitation matrix, including a separate note that the optional OpenSEO extension is permission- and cost-gated and was not invoked.

### Progress / next gate

- Phase 2 `Audit all existing business modules and their source contracts`: **checked (code/CI catalog, 18 tools / 9 module facades)**. This is an audit of the implementation contract, **not** production source acceptance.
- Phase 2 **7/8**, remaining only the independent per-metric source watermark, coverage, freshness, scope and version task. Overall roadmap **42/48 = 87.5%; 6 unchecked**. Source-specific real freshness/identity completeness and paid model validation must be verified independently; do not claim that static catalog metadata is a successful external data sync.
- No paid API/LLM calls, migration, deployment, external write/post, branch merge or `master` edits.

## 2026-10-31 — Phase 2 completed at code/CI level: metric source provenance and unverified freshness (43/48)

### Problem found

- Source clocks in legacy metric evidence were uneven: event `as_of` could appear while independent registration and verified-trade timestamps were absent, and some observations lacked explicit per-metric source-clock explanation. Successful reads were therefore vulnerable to interpretation as fresh/complete data.
- `query_metrics` did not archive `snapshot.events_complete_through` even when the event source explicitly reported that separate field. Other evidence snapshots still could not establish independent registration/trade completeness; no synthetic watermark is permitted.
- Model projections converted some missing source versions and watermarks into empty strings. Per-channel `reportEvidence` retains source filter in `filters.source`, but without a matching explicit source-metadata scope.

### Code changes

- New `backend/src/ai/business/sourceMetadata.js`: derives bounded source type, clock and conservative freshness from audited built-in tool contracts and formal metric classes (event-only, account creation, registration+events, registration+events+trade). Composite source clocks are never replaced by event-only timestamps.
- `backend/src/ai/business/evidence.js`: automatically adds immutable `sourceMetadata` to newly created metric evidence without changing query authorization, period or fingerprint. The metadata includes `sourceType`, `clock`, effective `scope`, `coverageStatus` and `freshness:{status,referenceAt,reportedCompleteThrough}`. Null/absent clock means `unknown`; recorded clock means `unverified`, not fresh. Per-channel report filter is reflected in the effective observed-source metadata.
- `backend/src/ai/business/tools/registry.js`: retains independently reported `events_complete_through` on applicable event metric evidence; missing complete-through is null; registration/trade remain independently unknown.
- `backend/src/ai/business/modelTransport.js`: bounded positive allowlist for new source metadata, with missing source versions/watermarks represented by **null**. `backend/src/ai/business/modelEvidence.js`: compact investigation transport preserves source clock/scope/freshness where budget permits; otherwise existing budget protection applies.
- No new collector or external source, SQL KPI redefinition, paid call, migration, production data mutation, overwrite of historical evidence, or branch merge.

### Tests / acceptance boundary

- `backend/test/businessModuleCatalog.test.js`: **18/18 built-in tool IDs** carry audited source, clock, definition version, scope, period, coverage status, no invented timestamps, and effective channel-filtered source scope.
- `backend/test/agentTools.test.js`: owner/scope registry evidence for account registration vs event vs mixed account+trade, GSC API sync reference, local CRM no watermark and true reported event complete-through. Source metadata remains model-visible without private identities.
- `backend/test/modelEvidenceCompact.test.js`: 3500-byte compact view retains only bounded observed source reference and unverified freshness with a partial-period GSC fixture.
- **Final source/test SHA:** `e5a08a39d4668d2895c23bc5997946885292a9a0`. [AI infrastructure CI 41200563427](https://github.com/dinnelthai/logearn-growth/actions/runs/41200563427) **passed AI Contract, AI Integration, AI Frontend**. These are fixture and integration-container checks, not live Google/X/CRM/Hologres/Worker or paid-model acceptance.
- The Phase 2 checklist item `Keep source watermark, coverage, freshness, scope and definition version with each metric` is now **checked at code/CI schema level**, with explicit unknowns as a valid documented state, not as a surrogate fresh source. See `docs/ai/GROWTH_SOURCE_CONTRACTS.md`.

### Progress

- **43/48 = 89.6%; 5 unchecked; Phase 2 8/8.** Other open: two Phase 1 operator/real-context acceptance; one Phase 3 stable activity-to-outcome association; two Phase 4 cost-aware question ranking / cheapest differentiating query based on actual trusted metadata.
- Real-source completeness and freshness, account/transaction association, actual paid AI analysis and report-quality evaluation have not been validated. No deployment, migration, sync, payment, external publish or `master` change.

## 2026-10-31 — Phase 3 Operating Memory stable activity→mature outcome links (44/48)

### Source and time integrity

- Prior Operating Memory already included the underlying owner-scoped activity settlement, explicit CRM collaboration↔activity references and same-KOL-profile observations, but the AI could not safely connect them into an outcome statement. An as-of bug also let historical reports show activity settlement saved after the requested period.
- `backend/src/ai/business/tools/operationsTimeline.js` now passes requested report `end` to `activityOutcome`; a settlement at or after the half-open end, or whose own `as_of/snapshot_cutoff` falls after report end, is not treated as a historical settled outcome. KOL observed source watermark is separated from the snapshot's own `capturedAt` time; both are needed to prove the observation existed by the report cutoff.

### Implementation and hard association boundaries

- `backend/src/ai/business/tools/registry.js#operationsTimelineSummary()` derives at most **8 `outcomeLinks`** from explicit CRM collaboration→activity keys, only where collaboration period **fully contains** activity period, settlement and its source-as-of are before report end, source-as-of covers the full activity period, and respective account, analysis or trade source coverage is **available**. Provides only independently observed aggregate `completed`, `analysis_users`, `trade_users`, `transactions`. Each link has hashed `collaborationRef/activityRef`, an aligned window, observed source timestamp and `attribution:'observed-non-causal'`. This is not KOL incremental credit.
- At most **8 `channelLinks`** require explicit same CRM KOL profile + referenced collaboration ID, a KOL observation interval fully spanning the collaboration, an observation source time at/after completion and before report end, and **a separately present capturedAt not after report end**. If a source observation was saved after the report, no historical link is formed even if its data watermark is backdated. The per-profile KOL metrics are only observed, non-exclusive cohort aggregates, never attributed to individual collaborations.
- `backend/src/ai/business/modelTransport.js` positive allowlist is extended for these two bounded relationship arrays, only opaque record refs, time windows, nonpersonal observed metrics and explicit relationship/attribution labels. No member IDs, wallet/token addresses, arbitrary raw evidence or same-day-only X/GSC matches are exposed.

### Tests, CI and limitations

- `backend/test/operationsTimeline.test.js` tests historically late settlement and late source snapshot rejection using the owner-scoped existing timeline reader.
- `backend/test/operationsTimelineRegistry.test.js` proves valid explicit matches and rejects missing links, unmatched KOL IDs, non-containing periods, late settlement/sourceAsOf, after-cutoff capture, absent capture proof and unavailable source; preserves independent unrelated KOL observations instead of manufacturing new attribution.
- **Final code/test HEAD:** `81bc9a06fba358c484eed9bb620ab303110d8ed5`; [AI infrastructure 41201630015](https://github.com/dinnelthai/logearn-growth/actions/runs/41201630015) **passed AI Contract, AI Integration, AI Frontend**. Several earlier intermediate commits ran before their corresponding regression fixtures were adjusted; final full run is the acceptance point. These are offline and integration-container fixtures, not live KOL, Worker or paid model verification.
- Phase 3 last checkbox checked **at code/CI level only**. **Total 44/48 (91.7%); 4 open; Phase 3 8/8**. This still does not demonstrate actual incremental conversion, true attribution or guaranteed external freshness. Remaining roadmap: Phase 1 two real-context/operator product definition gates, Phase 4 two measured-query-cost/hypothesis-planning gates.
- No model/paid provider calls, external collectors, deployments, migrations, production writes, or `master` changes.

## 2026-10-31 — Phase 4 cost-aware decisions with measured owner-local tool latency (46/48)

### Initial gap and measured implementation

- The growth ranking previously sorted goal-relevant candidate metrics and suggested 2–3 competing root-cause checks but lacked **trusted per-tool execution timing**; the previous query-cost field was therefore unknowable. We did **not** introduce guessed SQL costs, provider charges, or proxy USD prices.
- `backend/src/ai/business/tools/registry.js` now measures monotonic wall time of the successful tool operation, after scope and budget authorization, and records it once per authorized invocation into `executionTiming` on a new immutable evidence item. Multi-metric `query_metrics` calls produce one timing sample only; failed/timeout tool calls do not contribute successful samples. Wall time excludes unrelated work such as earlier snapshot lookup; it is **not** the cost of physical scan bytes or billing.
- `backend/src/ai/business/evidence.js` reuses existing owner-isolated `agent_evidence` rows to read recent successful timings. A tool gets an observed median only from **3 or more** bounded records in the prior 30 days with **the same owner, same authorized source/fixed audience scope, and a period within 20% of requested duration**. Old/invalid/mismatched records are excluded. Missing values do not equal zero cost. No migration or separate telemetry service was created.
- `backend/src/ai/growth/queryEconomics.js` checks this trusted sample contract; it identifies a candidate with lowest **observed median latency** only when *every* alternative is comparable. Otherwise it reports an explicit unavailable ranking. This must **never** be called "lowest actual dollar cost", "lowest information gain cost" or "guaranteed fastest next query"; `monetaryCost='unknown'`.

### Connection to actual decisions

- `backend/src/ai/growth/questionPriority.js` ranks only existing, verifiable business candidates by goal relevance, existing priority, explicitly reported affected users, same-metric user count change, evidence-backed confidence and actual observed tool timing (when available). Rate movement is not converted into a made-up affected-user population.
- `backend/src/ai/growth/planner.js` adds bounded question attention ranking to normal task planning. `backend/src/queues/jobs/businessAnalysis.js` is the **real Worker entrypoint**: it reads local, owner-scoped evidence, matches the final authorized capability list, pins a small timing snapshot in the saved context for exact replay and leaves unknown when data are missing. This makes the ranking effective for ordinary worker tasks without paid probes.
- `backend/src/ai/growth/modulePlanner.js` uses comparable observed latency to choose the faster **existing read-only alternative in the same authorized module**, otherwise preserves its reviewed default order; no extra query is run by the selection itself.
- `backend/src/ai/business/analysisContract.js` keeps strict distinct-hypothesis/evidence/schema/period/source checks and annotates the verified candidate discriminating queries with `discriminatingQueryEfficiency`, using only pinned evidence. Paid or unknown-cost capability stops any best-query claim; no model suggestion may extend permission.
- `backend/src/ai/business/modelTransport.js` (ordinary v5) and `backend/src/ai/business/weeklyContextV4.js` (13-module weekly v5) pass only a few source-verified ranking rows to the model, reducing/removing them before business KPI evidence if over the strict 22KB budget.

### Regression and CI

- `backend/test/agentEvidence.test.js`: owner-based isolation, minimum samples, scope/period contamination, missing currency costs, immutable evidence.
- `backend/test/growthPlanner.test.js`: goal relevance, observed population vs count change, evidence IDs, authorized tools, unknown money.
- `backend/test/modulePlanner.test.js`: same-module selection from observed latency with explicit unknown fallback and no paid calls.
- `backend/test/analysisCompetingHypotheses.test.js`: validated authorized competing reasons, known and missing timings, paid/unknown-cost capabilities.
- `backend/test/growthStatisticalModelTransport.test.js` and `backend/test/aiWeeklyContextBudget.test.js`: bounded, privacy-safe v5 ordinary and weekly hints, strict byte budgets, core statistics preserved.
- **Final source/test SHA** `6540a7a353b5fadb080f016afa2aa2b8795ece0f`; [AI infrastructure run 41204481078](https://github.com/dinnelthai/logearn-growth/actions/runs/41204481078) **passed Contract, Integration, Frontend**. Earlier intermediate CI results are not the final acceptance source.

### Checklist, remaining scope and execution boundaries

- Both Phase 4 code/CI checklist items are checked as **conditional measured-server-latency comparisons**, not monetary query cost optimization or validated root-cause information gain. Phase 4 **6/6**; overall **46/48 = 95.8%**, two Phase 1 checkboxes open for authorized real-context verification and operator product-map/North Star signoff.
- This does not validate real live Hologres/X/GSC/CRM freshness, production Worker runs, live paid model report quality, causal attribution or financial query costs. No paid provider probes, schema migrations, deployments, external posting/collection or `master` changes.
