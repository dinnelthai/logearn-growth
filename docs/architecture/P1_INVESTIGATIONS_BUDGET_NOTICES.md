# P1 — Alert-driven Growth investigations, call quotas and internal notifications

## What is implemented

- The read-only cross-day monitor still compares existing completed business snapshots; it does not recompute Growth indicators or automatically call an LLM.
- For a newly observed **P0 decline** while an owner-scoped alert is still open and unsnoozed, the monitor writes a `proposed` investigation record, keyed by `(owner_id, alert_id, period_end)`.
- The same transaction/statement appends one deduplicated **internal** notification for each new proposal. It does not send an email, webhook or public message.
- `GET /api/ai-analysis/growth-investigations` lists owner-scoped proposals. `POST /api/ai-analysis/growth-investigations/:id/action` accepts `approve` or `dismiss` and a current `expectedVersion`. Approval can enqueue the existing `business-analysis` Bull worker; dismissal makes no model call.
- Approval always uses the same `growth-investigate:<proposalId>` request key and Bull `jobId=analysisId`. A queued proposal links to the existing PostgreSQL analysis record. If queue submission fails, the approved draft can be submitted again with its current version.
- `GET /api/ai-analysis/growth-notifications` and `POST /api/ai-analysis/growth-notifications/:id/read` provide owner-scoped internal notices and read receipts.
- The existing AI Analysis UI displays proposals, internal notifications and the remaining shared paid-call allocation count.
- No external growth action is executed, and no new Growth SQL or metric definition is introduced.

## Fail-closed paid model admission

The shared per-owner, per-Bangkok-day call-count limit is `AI_GROWTH_PAID_CALLS_PER_DAY` (integer 0–100, **default 0**).

Each **human-approved anomaly investigation** must pass a PostgreSQL transaction before its first new provider request:
1. Acquire a transaction-scoped advisory lock for owner and Bangkok date.
2. Verify the analysis is currently owned by the Worker token, the lease is live, cancellation is false, and the referenced proposal is human approved and linked to this specific analysis.
3. Count previously reserved paid rounds, reject when the configured quota is exhausted.
4. Insert a unique allocation per `(analysis_id,round)` and the shared `ai_analysis_call_guard.started` in the *same transaction*.
5. Only after commit is the provider called. Allocations are never automatically refunded if a provider call errors or the Worker is killed; remote charges may already have occurred.

The new workflow uses this admission control for both normal Worker execution and checkpoint-aware continuation. Existing manual AI analysis uses its original shared paid-call journal and separate task bounds; **this quota does not restrict those other operations**.

Example:

```sh
# Review migration and back up the AI database before applying it:
cd backend && npm run migrate:ai

# Monitoring itself has no paid model requests:
AI_GROWTH_ALERT_MONITOR_ENABLED=1 AI_DAILY_OWNER_IDS='OWNER_ID' \
  npm run worker:growth-monitor

# Allow at most three newly reserved model rounds per owner per Bangkok date
# for explicitly human-approved alert investigations:
AI_GROWTH_PAID_CALLS_PER_DAY=3 npm run worker:ai
```

The backend API must also have the same positive `AI_GROWTH_PAID_CALLS_PER_DAY` to enable the approval endpoint. All deployment processes should use consistent configuration.

`GET /api/ai-analysis/growth-budget` exposes a count of reserved model calls and remaining slots for the current Bangkok business day. **It is not a USD ceiling**, does not estimate provider prices, and does not claim exactly-once billing. Hard dollar caps would require verified provider prices, token budgets and an explicit policy for unknown billing.

## CI and independent acceptance

- `backend/test/growthBudgetIntegration.test.js`: real PostgreSQL contention, per-day allocation enforcement, authorization, denial of duplicate rounds and invalid proposal claims.
- `backend/test/growthProposalIntegration.test.js`: real PostgreSQL concurrent proposal generation, deduplicated notices, owner isolation, human approval CAS and read receipts.
- Frontend page tests and build are part of GitHub Actions.

Codex/staging should also verify: migration upgrades from existing AI tables; crash between approval and enqueue; two API replicas approving the same proposal; disconnect after provider admission; Worker pause/restart; budget reset at 00:00 Asia/Bangkok; and unknown provider charges.

**Off by default**: automatic paid follow-up, external notification delivery, automated external operational actions, and production deployment.
