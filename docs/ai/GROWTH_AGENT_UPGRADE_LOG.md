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
