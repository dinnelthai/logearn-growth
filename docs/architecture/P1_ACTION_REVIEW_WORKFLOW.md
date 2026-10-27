# P1 Growth Action & Review Workflow

## Scope

LogEarn's deterministic business calculations, evidence adapters and existing AI suggestions/retrospective tables are unchanged. This update wires the already-present suggestion states into a controlled human approval workflow and exposes observational-review readiness.

### Human approval state transitions

`pending → adopted → executing → executed`. An operator may reject `pending`, `adopted`, or `executing` suggestions with a reason; they can invalidate these states. `executed`, `rejected`, `invalid` are terminal. The API refuses skipped steps or repeated updates with HTTP 409.

`PUT /api/ai-analysis/suggestions/:id/status` now uses PostgreSQL compare-and-swap on `id`, authenticated `owner_id` and original `user_status`. An actual action and execution timestamp are required on execution. Approval **records a human decision only**; no connector, external post, campaign, or trading transaction runs.

### Review readiness

`GET /api/ai-analysis/growth-review-queue` reads only the owner's `executed` suggestions without saved retrospectives. It checks the existing `reviewPeriods()` calculation against the **minimum of real time and the business data watermark**. An item is ready only after three *complete* Asia/Bangkok business days have been observed.

`POST /api/ai-analysis/suggestions/:id/retrospective` uses the same maturity gate, so early reviews fail instead of pretending incomplete data are zero. The existing retrospective Worker owns metric comparison, observational caveats and experience indexing. Results are never labeled causal without experiment evidence.

The AI Analysis UI hides illegal action buttons and displays a read-only queue of review-ready suggestions. A human initiates each paid retrospective with a unique request key.

### Guardrails

- No autonomous external actions and no automatic paid retrospecting are enabled.
- No new database tables, SQL metric calculations, AI frameworks or cron processes.
- Review data freshness is mandatory: an unavailable watermark blocks maturity checks.
- This is an initial operator workflow; full experiment design, multi-metric statistical significance and notification delivery are separate work.
- Codex independent review and production deployment remain outstanding.
