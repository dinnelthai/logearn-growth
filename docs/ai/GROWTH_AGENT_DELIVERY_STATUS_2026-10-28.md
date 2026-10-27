# Growth Agent delivery checkpoint — 2026-10-28

Branch: `feat/ai-growth-agent`. This checkpoint is an implementation and verification record, **not** a claim that production deployment or live API access has been validated.

## Reused mature infrastructure
- Node.js 22 built-in test runner, Express auth and routes, existing Bull/Redis workers and node-cron schedule.
- PostgreSQL transactional advisory locks and durable paid-call guard; existing SQLite owner-scoped context/trace.
- Existing business-metric adapters, SEO/GSC and KOL operations; no replacement SQL or self-built multi-agent runtime.
- Promptfoo for independent offline LLM regression evaluation; the included echo suite is only a synthetic assertion smoke test and **cannot** qualify a candidate for promotion.

## Implemented in this iteration
1. Offline fail-closed prompt evaluation checks (critical cases, quality/cost/latency), source-hash verification and operator approval.
2. Owner-scoped prompt candidate store and deduplication; versioned approval, zero-traffic activation, progressive 5/10/25/50/100% canary, rollback alias.
3. Exact archived prompt reuse on worker retry/recovery, even when a prompt alias changes in the meantime.
4. Strict Promptfoo result import CLI for measured real-provider holdout runs; synthetic/mock results are refused.
5. Owner-scoped, deduplicated research question creation from recorded business events, existing autonomous scheduler and human review endpoints. No model calls from discovery.
6. Per-owner/day reserved paid model-call cap for autonomous daily analysis using PostgreSQL transactions, preserved across initial and resumed work.
7. Optional policy-derived prompt candidates from mature retrospective signals; they are **not** autonomously evaluated/published.
8. GitHub CI offline Node tests, Redis/Postgres integration tests and frontend build.

## Unfinished or not independently verified
- **Real production E2E:** authenticated actual data → quality watermarks → four daily LLM analyses → actionable report → human feedback → next-cycle score. Mock CI and isolated tests do not prove live production services.
- **Actual production GSC/SEO/KOL connectors:** application code/tests exist, but OAuth property, access, rate limits, schedule and fresh real data must be checked in deployment.
- **Fully autonomous prompt improvement:** no independently witnessed blinded live candidate-vs-baseline comparison, no safe autonomous canary decision engine, and no automatic rollback based on production observation. A measured Promptfoo run and human approval are deliberately mandatory.
- **Broad autonomous research beyond recorded business events / existing anomaly scans:** a fully ranked, continuously refined research hypothesis engine and prospective validation loop remain unfinished.
- **Operational roll-out:** live worker status, production env flags, database migration, budget cap, cost rates, and monitoring cannot be certified by GitHub alone.
- **Dollar cost hard stop:** the new budget is a reserved *call-round count*, not a USD billing limit; the DeRouter cost rates may be unknown.

## Safe opt-in configuration
Never commit API secrets. In the backend deployment environment, set only after schema migration and deployment checks:
```text
AI_AUTONOMY_ENABLED=1
AI_AUTONOMY_OWNER_IDS=<explicit trusted owner ID>
AI_AUTONOMY_PAID_DAILY_ENABLED=1
AI_AUTONOMY_PAID_CALLS_PER_DAY=<integer 1..100>
AI_RESEARCH_DISCOVERY_ENABLED=1
AI_PROMPT_CANDIDATE_PROPOSAL_ENABLED=1
```
Prompt publishing and canary runtime remain **disabled** by default:
```text
# AI_PROMPT_AUTO_PUBLISH=1
# AI_PROMPT_RUNTIME_ENABLED=1
```
Use the existing worker `npm run worker:growth-autonomy`. PostgreSQL `npm run migrate:ai` and backend SQLite schema migration must be applied before startup; apply migrations with a backup and compatibility review, and never infer production state from CI.

## Automated checks
```bash
cd backend
node --test test/promptGate.test.js test/promptRegistry.test.js test/promptReplay.test.js test/promptfooAdapter.test.js test/researchQuestions.test.js test/autonomyBudget.test.js test/growthAutonomyRunner.test.js
# CI additionally runs Postgres + Redis contention suite and frontend build.
```

Acceptance must ultimately be supported by a **real, non-synthetic, redacted** business day ID, report ID, worker run status, actual provider usage, GSC checkpoint and a completed feedback-and-retrospective cycle. Never mark production E2E complete without those.


## Additional implementation batch — 2026-10-28
- **Content security:** manual content CRUD is now scoped by authenticated owner; legacy unowned records stay inaccessible pending explicit ownership reconciliation.
- **Follower workload:** bounded collection and profile-analysis batches now use the existing Bull worker instead of HTTP-process fire-and-forget. Collection pages persist cursor and pause after ten pages; profile analysis stops after twenty users per approved batch. Multi-host SQLite and production redis/job recovery remain unverified.
- **Read-only growth evidence:** owner-scoped content and follower summaries are registered in the existing AI business tool registry with independent manual/partial coverage metadata. Their specialized Growth Skills can be requested explicitly; they are not claimed as default automatic planning priorities.
- **Daily evidence sidecar:** daily autonomous briefs attach content publication observations and follower sampling status without changing original growth KPI calculations or inferring registrations/trades from reach.
- **Research:** record-driven content/audience source changes yield owner-scoped reviewed questions; this is not unrestricted LLM hypothesis generation or autonomous external action execution.
- **Promptfoo:** an opt-in operator CLI runs real provider baseline-vs-candidate safety holdouts via an installed Promptfoo CLI and blocks candidates without comparable evaluation. Never run or certify it without a real provider; no real-model evaluation was performed by CI. Real independent evaluator version/signatures and blinded business cases still need hardening.
- **Canary:** optional safety-only auto rollback on a verified jump in unknown paid-call traces with sufficient samples; does not auto-promote or prove business effectiveness.
- **Operator UI:** new Agent console displays owner status, persisted briefs, judgements, research approvals and prompt candidates; read-only except explicit reviewed research decision actions.
- **E2E acceptance:** `node backend/scripts/verifyGrowthAgentE2E.js OWNER YYYY-MM-DD` rejects missing persisted four-goal daily facts, evidence-score, scheduler, linked retrospective and sidecar. It was NOT run against production.

### Still open — deployment and external dependencies
1. Production X/blog/YouTube metrics connectors and first-party UTM -> verified registration/trade attribution. Existing content is operator-entered, not automatic platform metrics.
2. Real authenticated GSC and KOL API connectivity, rate-limit, source watermarks, migration and deployment evidence.
3. Real daily LLM reports and verified feedback-retrospective loop in production; CI is synthetic/isolated.
4. Production PostgreSQL/Redis/SQLite topology and durable queue recovery across host restarts; full USD-rated global budget and unified spend guard.
5. Operator-executed, independently archived Promptfoo evaluation against real model, business holdout, canary comparison and automatic promotion criteria (promotion intentionally human-gated).
6. Deeper ongoing LLM research hypothesis refutation and causal effects tracking; observed retrospectives cannot support a causal claim.

### New opt-in controls
```text
# Offline paid evaluation (operator CLI only)
AI_PROMPT_EVAL_PAID_APPROVED=1
PROMPTFOO_API_KEY=... # never put this in repository
PROMPTFOO_MODEL=...
PROMPTFOO_API_BASE_URL=https://...
AI_PROMPT_EVAL_MAX_PROVIDER_COST=...
AI_PROMPT_EVAL_MAX_LATENCY_MS=...

# Canary safety-only rollback; default disabled
AI_PROMPT_AUTO_ROLLBACK_ENABLED=1
```
