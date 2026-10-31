# Growth Agent 2.0 — Agent Handoff

> This is the first file a future Codex / ChatGPT Work / coding agent should read before continuing.

## 1. Current working branch

- Repository: `dinnelthai/logearn-growth`
- Required branch: `codex/ai-comprehensive-upgrade`
- Last code-validation commit: `c04bd5ba0d5f0c31bc6f5b8f1c65cc631c0b150c` (green AI infrastructure CI).
- Documentation HEAD immediately before this handoff refresh: `b6306a33254af8d6b737a352b5465038d793c69f`; fetch the live branch HEAD before every new edit.
- Latest successful CI: AI infrastructure run [41156542441](https://github.com/dinnelthai/logearn-growth/actions/runs/41156542441); desktop UI regression run [41155768483](https://github.com/dinnelthai/logearn-growth/actions/runs/41155768483).
- Checklist progress: 18 / 45 implementation items (40%); live-source acceptance is not included in that percentage.
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
- `backend/src/ai/growth/weeklyReport.js` — new v5 weekly prompt.
- Tests: `backend/test/aiBusinessBrain.test.js`, `backend/test/aiWeeklyContextV4.test.js`.

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
- Operating memory does not yet include all human KOL, SEO, X, community, campaign or training activity.
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

### P0 — Validate the v5 implementation

Green CI already ran the focused tests. If a local checkout becomes available, rerun from the required branch:

~~~bash
cd backend
node --test test/aiBusinessBrain.test.js test/aiWeeklyContextV4.test.js test/aiWeeklyReport.test.js test/productChainTrades.test.js
~~~

Then run broader targeted suites:

~~~bash
node --test test/aiWeeklyCoverage.test.js test/aiWeeklyDecision.test.js test/aiWeeklyContextBudget.test.js test/aiBusiness.test.js
~~~

Record exact passed / failed / skipped counts and failure reasons. Do not claim tests passed based only on syntax inspection.

### P0 — Preserve the operator's custom report-period requirement

The user explicitly requested that the report support a custom collection time range and not be limited to a calendar week. Review the current branch's frontend and backend before implementing. A previous change was made on another branch, so do not assume it exists here.

Required behavior:
- default to the latest completed week;
- allow custom start and end timestamps in Asia/Bangkok;
- end semantics are explicit (prefer exclusive end);
- validate range and maximum duration;
- compare with the immediately preceding equal-length period only if the metric/source contract supports it;
- display source-specific date alignment and coverage;
- retain report history and idempotency for exact periods.

### P1 — Complete Growth Intelligence

- [x] Code-level source contract: product-to-trade reads authoritative `trading_transaction` facts and confirmed ledger / indexed swap token enrichment; identity, token and visit association remain separate.
- [x] Bound the trade query to successful same-token analysis windows and expose truncation / unknown coverage.
- [ ] Validate actual Hologres latency, trade match rate and identity coverage using the already-authorized read-only source; CI fixtures are not live-source acceptance.
- Separate registration from first observed analysis; inspect `growthEvidence.registrationFacts` and adapt the existing registered-user metric only if the source contract is authoritative.
- Confirm activation denominator and maturity.
- Review SEO/GSC PT date alignment and X observation timestamps.
- Add source-specific coverage and evidence, not guessed data.

### P1 — Complete Operating Memory

Reuse existing records and services:
- `kolOperations.js`
- `seoOperations.js`
- content growth and X account/content adapters
- existing `operation_tasks` / activity monitor
- `businessReports` manual action history
- AI suggestion and retrospective records

Do not build a parallel CRM or task manager. Keep AI suggestion/review memory separate from human-entered operational activity.

### P2 — Decision Engine and Learning Loop

- Rank problems by business objective, impact, evidence strength and query cost.
- Produce competing hypotheses and a minimal discriminating investigation.
- Validate every proposed action's primary metric against the registry and retrospective service.
- Record execution and mature outcome using the existing workspace.
- Do not call an adopted suggestion “successful” until reviewed evidence supports it.

## 7. Validation / production boundary

This upgrade has not been deployed or tested against the user's live API/Worker. CI passed 166/166 active AI contract tests plus the targeted 22/22 and 112/112 suites, 17/17 PostgreSQL/Redis integration tests, and 429 frontend tests (4 skipped). These are fixture/service-container checks, not a real-source acceptance test.

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
