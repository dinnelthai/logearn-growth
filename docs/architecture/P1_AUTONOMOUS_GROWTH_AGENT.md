# P1 Autonomous Growth Agent: goals, daily briefs, self-review and strategy learning

## Purpose

Implement the complete **read-only autonomous growth operating loop**, using LogEarn's existing evidence/SQL, Growth Skill registry, AI model Worker, retrospective system and human action approval model:

1. Load mature source observations.
2. Evaluate outcomes against *operator-configured* KPI targets.
3. Produce an AI daily brief from completed, evidence-linked AI investigations.
4. Compare prior advice and optional structured predictions with matured action retrospectives.
5. Save a versioned, auditable investigation strategy that affects what evidence the next daily Growth Planner reviews.
6. Reconcile incomplete daily work unattended, notify the owner in-app, and optionally send a signed external webhook.

The Agent **does not** change core analytics/trade SQL, manipulate Growth KPI definitions, deploy code, approve actions, publish campaigns, request indexing or place trades. AI recommendations remain human approved and actual execution recorded separately.

## Key modules and data

- `agentScore.js`: read-only source KPI extractors (active/new/returning *observed analysis* users; mature activation rate, mature D7, weekly core users). The score is the weighted percentage of explicit target completion (capped at 100 per target). **No targets, incomplete history, immature watermark, missing denominators or unsupported KPI → null score**, not zero.
- `agentStore.js`: PostgreSQL owner-scoped targets with CAS versioning; idempotent immutable-key daily briefs, daily in-app notices, historical retrospective evidence and strategy revisions.
- `agentBrief.js`: one brief per owner/Asia-Bangkok business day/source, drawing only from existing completed `growth-daily:v1` analyses for selected goals. Each section shows source analysis ID, model summary, evidence-cited candidate actions and quality warnings. Missing analyses produce a partial or blocked report, never invented results.
- `agentLearning.js`: historical assessments only from executed suggestions and *saved* mature retrospectives. Supports `observed-supported`, `observed-contradicted`, `insufficient`; these are observational associations **not estimates of causal effectiveness**. No matured evidence = no new learned policy.
- `agentForecast.js`: optional, explicitly evidence-cited structured model forecast on each suggestion: supported primary metric, direction, 3–14 day horizon, minimum % change, confidence and evidence IDs. Stored atomically in `ai_suggestions.forecast`. Match/miss is computed **only if the later retrospective covers the same exact number of complete days**, has a usable denominator and medium/high confidence. Otherwise calibration is insufficient. Missing forecast does not become a failed prediction.
- `planner.js`: the saved policy can adjust the **order of read-only investigation skills**, using no more than three reviewed metric focus hints. Does not change ranked business candidates or automatically execute operations.
- `agentAutonomy.js`: orchestrates review refresh, optional missing-goal paid dispatch, scoring, saved reports and in-app notification.
- `growthAutonomyScheduler.js`: dedicated, opt-in worker, defaults to every 30 minutes in Asia/Bangkok, reconciles the two prior days at **zero additional model calls**. Only the latest day can start a new model analysis, and only with a **separate paid flag**. PostgreSQL request-key and Bull job ID dedupe existing daily calls.
- `agentOutbox.js`, `agentWebhook.js`: opt-in, owner-authorized external daily summary delivery. PostgreSQL outbox prevents duplicate enqueue, leases delivery across replicas, retries with bounded exponential backoff (up to five attempts); HTTPS requests use HMAC SHA-256 and an idempotency header. Receivers must honor that key because a network timeout after acceptance cannot guarantee exactly-once external delivery.

## Web interface and HTTP endpoints

The existing AI Growth page now has **AI Growth Agent · 自主运营驾驶舱**:

- `GET /api/ai-analysis/growth-agent/status` — current env flag configuration (not a claim that a scheduler process is alive), latest stored brief and target count.
- `GET /api/ai-analysis/growth-agent/targets`, `PUT /api/ai-analysis/growth-agent/targets` — owner-controlled goals, weighted metrics and optimistic version locking.
- `GET /api/ai-analysis/growth-agent/briefs` and `/briefs/:day` — daily grades, AI summaries, confidence/watermark caveats, evidence and proposed next actions.
- `GET /api/ai-analysis/growth-agent/learning` — mature retrospective matches/misses, structured forecast calibration and strategy versions.
- `POST /api/ai-analysis/growth-agent/refresh` — **zero-paid** reconciliation of already stored analyses, approved actions and mature review feedback. It never enqueues an LLM call.
- Existing human approval and retrospective endpoints remain the only way to mark an action executed and start a paid retrospective.

## Deploy configuration (disabled by default)

Install migrations and validate with Codex and database backups first:

```sh
cd backend
npm run migrate:ai

# Safely inspect the intended owner and goals, no DB writes or paid work:
AI_AUTONOMY_OWNER_IDS=YOUR_LOGEARN_USER_ID \
 npm run worker:growth-autonomy -- --dry-run

# Enable aggregation, self-review and in-app notifications only:
AI_AUTONOMY_ENABLED=1 AI_AUTONOMY_OWNER_IDS=YOUR_LOGEARN_USER_ID \
 npm run worker:growth-autonomy
```

Optional non-default settings:

- `AI_AUTONOMY_GOALS=activation,retention,conversion,revenue`: selection of daily goals. **Up to four separate paid business analyses per day** can be dispatched if the paid switch is enabled. Select fewer if cost or upstream data maturity prevents full coverage.
- `AI_AUTONOMY_SOURCE=all`: one existing source scope.
- `AI_AUTONOMY_CRON=*/30 * * * *`: review saved state periodically.
- `AI_AUTONOMY_PAID_DAILY_ENABLED=1`: **explicitly permits** enqueueing a missing latest-day analysis per configured goal. Do not set until model credentials, provider billing, backup/recovery and source coverage are reviewed. Historical automatic retries never start a new paid analysis.
- `AI_AUTONOMY_EXTERNAL_NOTICES_ENABLED=1` with server-only `AI_AUTONOMY_WEBHOOKS_JSON` mapping authorized LogEarn owner IDs to trusted HTTPS URLs and long HMAC keys enables external delivery. **Do not put webhook secrets, model keys or service credentials into this chat, browser fields or GitHub.**

Example *shape*, not a credential:

```json
{"OWNER_ID":{"url":"https://alerts.example.com/agent-daily","secret":"SET_IN_SECRET_MANAGER_AT_LEAST_24_CHARACTERS"}}
```

The HMAC signature is in `X-LogEarn-Signature`, with `X-LogEarn-Idempotency-Key`. The integration sends only a bounded summary and status, never user/token-level data. There are **no automatic external actions** beyond the explicitly configured summary webhook. Browser and AI provider billing are unchanged.

## Independent acceptance and limitations

GitHub Actions covers:

- `growthAgentAutonomy.test.js`, `growthAutonomyRunner.test.js`, `growthAutonomyHttp.test.js`
- `growthAutonomyIntegration.test.js` against real PostgreSQL
- `growthAgentForecast.test.js`, `growthAgentForecastIntegration.test.js`
- `growthAgentWebhook.test.js`, `growthAgentOutboxIntegration.test.js`
- Existing P0 model-call journal and frontend test suite

Codex must independently verify API owner fencing, migration upgrade/rollback, real business snapshot maturity, scheduler restart/duplicates, provider-paid crash windows, XSS/notification privacy, outbound idempotency and delivery infrastructure before enabling any production flags.

**Important rollout caveat:** Adding the optional forecast instruction to the model prompt changes the prompt fingerprint. Drain/finish in-flight model work before rolling out this change, or let the existing recovery mechanism fail closed when prompt evidence differs. Never bypass the paid-call journal to force old checkpoints to replay.

This feature is a *bounded adaptive decision support system*, not autonomous code rewriting or proven causal optimization. It records failure and absence of evidence as first-class outcomes so the next investigation can become more targeted without distorting source metrics.
