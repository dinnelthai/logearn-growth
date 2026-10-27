# P1 Growth Operations Inbox

## Current implementation

- `src/ai/growth/inbox.js` derives an immutable, prioritized read-only operational inbox from existing owner-scoped analysis summaries, suggestions, and maturity-checked review candidates.
- `GET /api/ai-analysis/growth-inbox` uses the existing PostgreSQL records and Hologres watermark. Missing or invalid watermarks suppress due-review tasks; it does not convert missing data to zero.
- `frontend/src/pages/aiAnalysis.js` renders the inbox with P0/P1/P2, approval counts, due-review counts, failure counts, and links to existing analysis details.
- `backend/test/growthInbox.test.js` verifies deterministic sorting, omission of nonactionable records, no mutations, and no paid or external actions.
- The integration adds no new metric SQL, data adapters, database tables, cron job, or billing calls. All mutation and retrospective endpoints remain separately protected.

## Scope boundaries and roadmap

The inbox is an **operator queue**, not an event alerting engine or autonomous execution subsystem. Its tasks summarize existing records and workflow statuses. Candidate anomaly triage lives in `src/ai/growth/triage.js`; it is generated when a business report exists. Automated alerts and action execution remain disabled.

To extend this safely, first add owner-scoped acknowledgement/snooze state with auditable history, then snapshot-to-snapshot anomaly comparison with proven source watermark compatibility, and finally budgeted notification delivery. Model-paid work must stay independently opt-in. Codex should verify owner isolation, stable pagination, stale-watermark behavior, and the accuracy of the `processing` heuristic before production use.
