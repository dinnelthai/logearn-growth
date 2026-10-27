# P1 Growth Skills, Planner and Daily Analysis

This implementation adds orchestration to the existing LogEarn analytics stack. It does not change Growth SQL, metric definitions, trade calculations or evidence adapters.

## Modules

- `src/ai/growth/skills.js`: versioned declarative, read-only skills: daily overview, activation, retention, channels, trading conversion and revenue.
- `src/ai/growth/planner.js`: deterministic plan selection from the **existing** business report's ranked candidates. No speculative data or autonomous outbound actions; plan is embedded in the model's immutable context as `growthPlan`.
- `src/ai/growth/daily.js`: unique daily owner-scoped request keys, prior complete calendar day in `Asia/Bangkok`, and use of the existing PostgreSQL AI record + Bull `business-analysis` worker.
- `src/queues/workers/dailyGrowthScheduler.js`: isolated opt-in cron process. It does not run in the HTTP server or each Bull worker.

## API

- `GET /api/ai-analysis/growth-skills`: list skill names, versions and permitted read-only tools.
- `POST /api/ai-analysis/growth-plan` with `{"reportId":"...", "goal":"activation"}`: prepare a read-only plan for an owner-visible existing business report; makes no model calls and enqueues no task.
- Existing `POST /api/ai-analysis/analyze` and `GET /api/ai-analysis/:id` remain the action/report endpoints.

## Daily schedule configuration

By default the daily scheduler is **off** and no paid work is created.

```bash
cd backend
AI_DAILY_OWNER_IDS='YOUR_EXPLICIT_OWNER_ID' npm run worker:growth-daily -- --dry-run
AI_DAILY_ENABLED=1 AI_DAILY_OWNER_IDS='YOUR_EXPLICIT_OWNER_ID' npm run worker:growth-daily
```

The process runs at **09:10 Asia/Bangkok**, controlled by `AI_DAILY_CRON` (default `10 9 * * *`). To enqueue a single daily run instead of operating continuously, use `--once`. Optional `AI_DAILY_GOAL` is one of `activation`, `retention`, `conversion`, `revenue` (default `activation`); optional `AI_DAILY_SOURCE` defaults to `all`.

The input period is the preceding fully completed Bangkok calendar day. The existing data-watermark check may reject the report if upstream storage has not caught up. A failed record is not silently retried: it requires deliberate remediation or a new request key after checking for prior paid calls.

Idempotence uses PostgreSQL's unique `(owner_id,request_key)` and a deterministic Bull `jobId=analysisId`. Duplicate scheduler processes do not generate distinct daily analysis records, but you should operate one scheduler for clarity. Analysis Worker, Redis, PostgreSQL, detailed SQLite checkpoints and existing LLM credentials must be available.

## Design boundaries

- Growth Skills are **policy/intent descriptors**, not independent copies of analysis code. They reference existing read-only tool IDs and the deterministic business report service.
- The planner does not claim causal inference; coverage and cohort maturity warnings are propagated.
- No operational actions are executed automatically, and no new Agent framework or database is introduced.
- Every scheduled model analysis can incur provider charges. Opt-in is explicit. Review existing budget and billing guardrails before enabling.
- Production deployment and independent Codex review remain separate from feature development.
