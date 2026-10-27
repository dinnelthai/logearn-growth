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
