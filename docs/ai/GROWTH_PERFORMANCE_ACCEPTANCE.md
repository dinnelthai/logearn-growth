# Growth refactor: performance and Token acceptance

Branch: `codex/refactor-growth`. This is a **verification playbook**, not a production benchmark report.

## 1. SQL plan capture (no model usage)
Run only with a verified read-only Hologres account on the intended database:

```bash
cd backend
HOLOGRES_EXPLAIN_APPROVED=1 \
HOLOGRES_EXPLAIN_EXPECTED_DB=<verified-database-name> \
node scripts/explainHologres.js --output=hologres-plan.json
```

Default is **EXPLAIN without ANALYZE**: estimated planner costs, not actual latency.
For real timing, explicitly set `HOLOGRES_EXPLAIN_ANALYZE_APPROVED=1`
and pass `--analyze`; the query is read-only but **executes expensive scans**
under a 10-second statement timeout. Do not enable in production without approval.
Compare `status-count/sources/strategies/eventTypes` against `status-combined`:
planning cost, actual time where authorized, rows and plan-node shape.
Enable `HOLOGRES_STATUS_COMPACT_ENABLED=1` only after independently
confirming source list, strategy list, event-type facets and event counts match.

## 2. Cross-process cache
Default disabled. Requires BOTH `GROWTH_SHARED_CACHE_URL` and a unique
`GROWTH_SHARED_CACHE_NAMESPACE` for each environment, database and events source.
Only immutable snapshot metadata, aggregate-only weekly-core **payloads** and
snapshot-pinned north-star summaries qualify. Raw weekly-core user_key lists,
live status, owner-private reports and LLM outputs are never stored. Disable the env key
if Redis availability or eviction behavior causes issues. Compare L2 hits,
Hologres query count, P50/P95, and snapshot parity.

## 3. Token and analysis quality
The existing owner-scoped, read-only `/api/ai-analysis/growth-agent/cost-audit`
and `ai_usage_logs` are the usage sources. Compare the SAME labeled scenarios
before and after the refactor, including metric, source and priority of every
important anomaly. Export **only** authorized, redacted evaluation fixtures.
Avoid direct production/user data in the repo.

```bash
node backend/scripts/compareAgentEfficiency.js path/to/paired-labeled-cases.json
```

A sample at `backend/test/fixtures/agentEfficiency.synthetic.json`
is **synthetic** and measures only the contract.
Only cases with complete token/cost usage AND all expected anomalies detected
AND verified coverage contribute to the comparable subset. The report refuses
to claim a full saving if any case is incomplete. The tool NEVER calls a model.

## 4. Required production acceptance before merge
- Hologres `EXPLAIN ANALYZE` (authorized replica) and parity results across
  4 old SQL statements vs 1 candidate statement
- Snapshot generation/version correctness under multiple processes; disable
  shared cache on namespace collision or poor L2 reliability
- Real pre/post model usage and verified analysis quality on the same cases
- Successful full GitHub CI plus real dev end-to-end owner isolation, opt-in
  payment gating, replay and database migration verification
- No automatic approval/publishing, no unreviewed live production migration

The current branch does not claim live Hologres benchmarking, production
deployment, or measured Token savings.

## 5. Shared daily report execution contract
With `AI_AUTONOMY_SIGNAL_GATE_ENABLED=1` and explicit paid dispatch
authorization, the scheduler builds four goal-specific reports from one
source snapshot, vets evidence completeness, and persists **eligible** reports
inside owner-scoped `ai_analysis_records.data_snapshot`. The AI worker only
reuses an exact `daily-preflight-v1` report whose date, source, goal,
snapshot ID and bounded payload match the claimed job. An old conflicting
pending record or mismatched seed is not silently replaced/recomputed.
When the gate is disabled, the original per-goal report path remains intact.

Test both scheduler and worker claims with actual development AI PostgreSQL;
unit and temporary CI database tests do not prove that production workers
have the same environment. Normal owner/paid-call fencing is unchanged.

## 6. Deployment switches: default OFF
- `GROWTH_SHARED_CACHE_URL` + unique `GROWTH_SHARED_CACHE_NAMESPACE`
- `HOLOGRES_STATUS_COMPACT_ENABLED=1` after real Hologres plan + parity review
- `AI_AUTONOMY_SIGNAL_GATE_ENABLED=1` after evidence quality acceptance

Do not enable these switches from this PR alone. Operators must review the
real Hologres plan, confirm source-watermark coverage, then canary with
recorded rollback conditions. No production migration or paid inference
is performed by the verification scripts.
