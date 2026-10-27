# P1 Growth Agent — Investigation Lifecycle Workbench

## Goal

Show the operator a coherent, read-only chain from a **specific** detected business-day anomaly to human-approved AI investigation, suggested actions, execution and observational reviews. This feature does not rewrite Growth KPI calculations, change the source analytics database, execute external actions or make paid LLM requests.

## Endpoints and fields

`GET /api/ai-analysis/growth-investigations/:id/timeline`:

- All records are scoped to the authenticated `owner_id`. The proposal must exist; its alert must still exist and belong to the owner. If there is an analysis association, that analysis must also belong to the same owner and the `filter_conditions.proposalId` and `sourceAlertId` must match.
- The `originalObservation` comes from the proposal's immutable `evidence`, **not** from the alert's latest mutable period. Baseline/current analysis IDs remain visible for audit.
- The response includes a stage, associated analysis status/summary/key findings/evidence IDs, suggestions with approved/executed status and actual actions, plus all saved retrospective conclusions and their causal-evidence flags.
- Uses original `ai_growth_investigation_proposals`, `ai_growth_alerts`, `ai_analysis_records`, `ai_suggestions`, and `ai_retrospectives`; no new tables are created.
- If an association is corrupt or inaccessible, the endpoint fails closed with HTTP 409 rather than guessing a replacement link.

`GET /api/ai-analysis/growth-inbox`:

- Includes proposal records alongside analyses, suggestions and alerts. For a current-period proposal, it suppresses the duplicate untriaged alert task.
- A newly proposed major decline yields one `investigation-approval` task; an approved draft lacking an associated analysis yields a `investigation-dispatch` follow-up. Obsolete/dismissed proposals remain viewable in history but do not trigger new paid work.
- Inbox links open the same lifecycle panel in the existing AI Analysis UI.

## UI

The existing AI Analysis page adds **查看完整链路** to proposals and related Growth inbox tasks. The panel loads details on demand, shows the original anomaly observation and its source report IDs, the associated AI summary/evidence, individual actions, and retrospectives. It is strictly read-only; approval, model calls and executing operational tasks require their pre-existing dedicated controls.

## Tests / acceptance

- `backend/test/growthInvestigationTimeline.test.js`: immutable observation, stage transitions, multiple reviews, incorrect/foreign analysis associations and no authorized proposal.
- `backend/test/growthInvestigationTimelineHttp.test.js`: HTTP owner isolation and zero paid model calls.
- `backend/test/growthInbox.test.js`: proposal task priority, stale/dismissed handling and duplicate suppression.
- `frontend/src/analytics/__tests__/aiRecoveryPage.test.js`: renders original source and review without enqueueing model or retrospective operations.

These tests are included in `.github/workflows/ai-infrastructure.yml`. GitHub CI is an automated check, not production data verification. Codex should independently verify permission boundaries, pagination and indexing on large data, and the meaning of retrospective conclusions.

## Next work

Unify operational diagnostics around the timeline, then add evidence-backed SEO and KOL-specific data adapters only after confirming source contracts. Dollar cost caps are explicitly out of scope until middle-provider metering is reliable. External notifications, production deployment and auto-paid investigations remain disabled.

## Operator inbox consolidation and review query performance

- The owner-scoped `growth-inbox` endpoint now reads the current latest-period investigation proposals in addition to original owner-scoped alerts, analyses, and action suggestions. A current proposal replaces a duplicate untriaged alert; only a `proposed` case requires approval. An `approved` proposal with no attached analysis signals a **dispatch-review** task rather than asking the operator to reapprove it.
- Dismissed or stale proposals remain available in the original proposals list/audit trail, but do not generate new work from an obsolete business period. Inactive, acknowledged or snoozed alarms do not request new approvals.
- Each inbox case task can open the same read-only timeline. Manual approval and any provider work still go through their existing guarded routes.
- Retrospectives for an analysis are now loaded in **one** owner-scoped SQL query via `listRetrospectivesByAnalysis`, replacing up to 100 repeated per-suggestion queries. Returned rows are verified against the authenticated owner's analysis and known suggestion IDs before rendering. More than 100 suggestions yield an explicit error rather than silently truncating linked reviews.
- Added API/inbox regression tests for owner separation, duplicate suppression, dispatch-retry alerts, frozen evidence and no paid calls.

No changes were made to the underlying Growth metric SQL or trading/attribution business logic. Dollar-cost caps remain deferred.
