# P1 — Cross-day Growth monitoring and experience feedback

This feature deliberately reuses **completed daily business-analysis snapshots**, never reimplements Growth SQL or silently invokes an LLM.

## Detection contract

- `src/ai/growth/crossDay.js`: compares **two adjacent** completed `dailySchedule=v1` analysis records with the same authenticated owner, goal and source, exactly one full Asia/Bangkok business day each.
- Both source snapshots require verified history coverage, `asOf >= period.end`, `eventsCompleteThrough >= period.end`, and no truncation. Missing coverage, missing counters or nonadjacent days produce **no alert**.
- Only three existing deduplicated observed-user count IDs are eligible: `active_users`, `new_users`, `returning_users`. The first version requires a baseline of at least 20, a change of at least five users and at least 20% relative change. These are **operational triage heuristics**, not statistical significance or causal diagnoses. Ratios such as D7 are excluded until denominator/cohort comparability is independently validated.
- `src/ai/growth/monitor.js` reads the two most recent completed daily records from existing PostgreSQL and writes only confirmed signals to `ai_growth_alerts`. It makes **zero paid model calls**.
- PostgreSQL `UNIQUE(owner_id,fingerprint)` and `last_period_end < EXCLUDED.last_period_end` handle concurrent scans and retry. The associated `ai_growth_alert_events` is an append-only audit record of new periods and human decisions.
- Alert identity groups by owner, source, goal, metric and change direction. A new observed business day increments the occurrence counter. A resolved issue reappearing in a new period reopens automatically. An acknowledged issue stays acknowledged unless an operator changes its status.
- If no completed prior day exists, the scanner reports insufficient history rather than inventing a baseline.

## Explicit opt-in monitoring

**Apply the reviewed migration first:** `cd backend && npm run migrate:ai`. It introduces `ai_growth_alerts` and `ai_growth_alert_events` only; it does not modify Growth event tables.

```bash
cd backend
AI_DAILY_OWNER_IDS='EXPLICIT_OWNER_ID' npm run worker:growth-monitor -- --dry-run
AI_GROWTH_ALERT_MONITOR_ENABLED=1 AI_DAILY_OWNER_IDS='EXPLICIT_OWNER_ID' npm run worker:growth-monitor -- --once
AI_GROWTH_ALERT_MONITOR_ENABLED=1 AI_DAILY_OWNER_IDS='EXPLICIT_OWNER_ID' npm run worker:growth-monitor
```

The dedicated scanner defaults to **10:30 Asia/Bangkok** (`AI_GROWTH_ALERT_CRON` optional). It uses the same `AI_DAILY_GOAL` (default `activation`) and `AI_DAILY_SOURCE` (default `all`) as the separate daily scheduler. The source daily scheduler must actually have produced **two consecutive completed days** for that owner and goal. Unfinished or incomplete records are never substituted with fresh unverified calculations. Both schedulers are disabled by default.

## Owner-scoped API and operator controls

- `GET /api/ai-analysis/growth-alerts` (append `?resolved=1` to include resolved).
- `POST /api/ai-analysis/growth-alerts/scan` with `{"goal":"activation","source":"all"}` performs a **manual zero-LLM** scan.
- `GET /api/ai-analysis/growth-alerts/:id/history` reads an exact owner-verified alert's append-only event history.
- `POST /api/ai-analysis/growth-alerts/:id/action` with `{"action":"acknowledge","expectedVersion":1}`, or `snooze` plus future `snoozeUntil`, or `resolve` / `reopen`. Updates use optimistic version fencing and atomically append audit events. Snooze is limited to 30 days.
- `GET /api/ai-analysis/growth-inbox` includes unacknowledged, unsnoozed, unresolved observations alongside existing approvals and reviews.
- The existing AI Analysis screen provides scan, acknowledge, snooze and resolve controls; no external notifications or operational actions are sent.

## Retrospective feedback into Growth Planner

- `src/ai/growth/experienceFeedback.js` uses the existing `ai_experience_index` joined through owner-scoped `getAnalysisMemory()`. It accepts only completed human-executed suggestions, recognized `validation_metrics.primary`, explicit `effective` / `ineffective` labels, compatible source scopes and review evidence within the last 180 days.
- `planGrowthInvestigation({history})` adds observed outcome counts and explicit **non-causal warnings** to relevant skill steps. In equal candidate priority, previously unsuccessful observations may increase *investigation attention* but **never trigger external actions** or suppress investigation entirely.
- Both the normal Business Analysis Worker and the no-charge plan-preview endpoint supply the historical context. No metric or attribution calculations are changed.

## Codex and staging verification

1. Run `npm run migrate:ai` on a copy of the current production AI schema and verify idempotence and rollback.
2. Confirm the two dates have nonoverlapping **adjacent** full business-day ranges, equivalent source and metric definition, complete history and event watermarks; otherwise fail closed.
3. Check concurrent scans on two processes create **one** observation per fingerprint and period, while two real subsequent observations increment the count once each.
4. Acknowledgement/resolve/snooze require valid owner and current version; rejected changes must not insert audit rows. Review historical events for owner isolation.
5. Verify the monitoring cron is opt-in and never initializes model/provider requests; its exception path must not interrupt AI daily analysis.
6. Historical effectiveness labels come from observational reviews. Ensure the Planner never treats them as proven causal or as permission to execute or silently skip a metric.
7. Complete UI and real-data smoke tests before production. Automatic paid follow-up is still disabled.

No schema or SQL within the LogEarn analytics, funnels, retention, attribution, trading or Hologres data-ingestion modules was touched.
