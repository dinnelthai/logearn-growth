# Growth Executive — Unified One-Turn Implementation and Acceptance

Date: 2026-10-31. Branch: `codex/ai-comprehensive-upgrade`.

**Scope:** all seven remaining Growth Executive upgrade themes were addressed in one linked change set, using existing infrastructure. This is **not** a declaration that production is already configured, all branches merged, or independent live sources have passed signoff.

## Concrete implementation

| Original task | Implemented code | Still not proven or not attempted |
| --- | --- | --- |
| 1. Unified goals | Workspace North Star `active_users` is primary; `executivePortfolio.goalAlignment` presents PostgreSQL daily targets without equating monthly distinct audiences or overwriting either database. Optional PostgreSQL read on dashboard is `GROWTH_EXECUTIVE_GOAL_ALIGNMENT_ENABLED=1`. | There is **no cross-database transactional unified write authority**; that requires a separately designed migration, explicit governance and production coordination. |
| 2. Autonomous investigation | Optional `GROWTH_EXECUTIVE_RESEARCH_ENABLED=1` runs up to three owner-authorized **free, read-only** business modules, persists exact source evidence IDs and a real investigation state, and deduplicates by frozen observation. A failure remains visible; causes are hypotheses until verified. | True root-cause attribution, autonomous paid follow-up, external API availability, and high-quality real-world data still require validation. |
| 3. Action execution | Approved internal `gw_actions` generate three sequenced `gw_executive_workitems` (source verification → reviewed runbook → execution/outcome evidence). A task advances only with verified owner evidence or a human-written deliverable. Existing fixed-cohort `operation_tasks` is **not** duplicated or altered. | Human delivery, Slack/CRM execution, cross-system atomicity and end-to-end production task outcomes not yet observed. |
| 4. Proactive reminders | Persistent owner-scoped `gw_executive_notices`, deduplication, acknowledgement and backlog covering approvals, stalled accepted/executing actions, mature reviews, overdue tasks and internal work items. External webhook reuses the existing signed outbox only with **both** pre-existing per-owner external webhook authorization and the additional `GROWTH_EXECUTIVE_EXTERNAL_REMINDERS_ENABLED=1`; payload is minimal metadata only. | Actual deliverability, external endpoint auth and retry outcomes not verified. No webhook sent in this task. |
| 5. Economic opportunity decisions | `executivePortfolio` ranks observed North Star anomalies and data-quality blockers, carries evidence strength and previous negative observations. Missing actual affected population, cash spend, incremental ROI and effort stay explicitly unknown. | ROI and attribution cannot be computed from missing budgets and counterfactuals; monetary-priority strategy requires real costs and observed effects. |
| 6. Continuous learning | Workspace matured action reviews now require matching metric, unit, scope, source and later comparable time windows before claiming observed movement; prior repeated adverse outcomes suppress blind repetition. Existing AI fixed-cohort learning and prompt canary gates are retained. | No causal claims or randomized experiment uplift. Strategies cannot self-publish without approved independent evaluation. |
| 7. Real E2E acceptance | Added CI tests and reviewed the connected local workbench **read-only**. The local tab at review time still displayed archived **v4 / 12-module** report, **0** stored workspace goals and scheduler **not enabled**. | The remaining **48th** Growth Agent 2.0 checklist item—real, already-authorized v5 saved context/source acceptance—is **not passed**. Real Hologres identity/coverage, current 13-module v5 report, GSC/X/KOL watermarks, Worker/outbox, costs and real-world execution must be checked in an authorized running environment. |

## Feature gates and rollout

- Scheduled Executive work requires the **existing** `AI_AUTONOMY_ENABLED=1` owner list and `GROWTH_WORKSPACE_DISCOVERY_ENABLED=1`. No automatic paid model dispatch: existing paid limits remain independent.
- `GROWTH_EXECUTIVE_CYCLE_ENABLED=0` disables the new free observation sub-cycle.
- `GROWTH_EXECUTIVE_RESEARCH_ENABLED=1` is a **separate opt-in** for up to three read-only registry calls. Default off.
- `GROWTH_EXECUTIVE_GOAL_ALIGNMENT_ENABLED=1` opts in a dashboard read of independent PostgreSQL Agent targets. Default off. Missing PostgreSQL state remains unknown.
- `GROWTH_EXECUTIVE_EXTERNAL_REMINDERS_ENABLED=1` opts in external reminders **only for owners already configured under** `AI_AUTONOMY_EXTERNAL_NOTICES_ENABLED=1` and `AI_AUTONOMY_WEBHOOKS_JSON`. Default off. Notifications use the existing HMAC signing, idempotency and bounded retries.

**Database migration:** `gw_executive_notices` and `gw_executive_workitems` extend the existing idempotent `workspaceStore(...,{initialize:true})` schema. The normal production `workspaceStore` is **not** a migration runner. Before enabling scheduled scans, back up/review the SQLite file and use the repository's already-approved `backend/scripts/migrateGrowthWorkspace.js` workflow with `GROWTH_WORKSPACE_SCHEMA_APPROVED=1` **only after explicit deployment approval**. No migration ran in this change. Dashboard read-only access tolerates missing optional tables; scheduled writes must fail visibly rather than claim success.

## Proof and acceptance limits

Tests cover owner isolation, evidence validation, immutable records, idempotency, workflow states, reminder acknowledgements, private payload exclusion, goal horizons, source-warning triage and review chronology. GitHub CI success is code/fixture validation, **not** production or actual model acceptance.

The historical roadmap remains **47/48 code/CI**, with the actual v5 context/source signoff unresolved. This document must not mark it 48/48 or suggest live model calls/deployment were completed.

## Next authorized environment verification

1. Run approved SQLite migration; verify read-only dashboard, exact user scoping and opt-in gate reporting.
2. Enable the leased scheduler on an authorized non-production dataset; verify no duplicate cycle or paid calls, data-quality uncertainty, one draft per episode, investigation dedupe and explicit evidence links.
3. Review an **existing authentic v5** saved snapshot through the read-only audit API, confirm 13 modules and value/path citations, and reconcile GSC/X/KOL freshness.
4. Validate Worker, safe retries/unknown charges, active_users click-event identity and trade identity exclusions; measure actual P50/P95 after deployment approval.
5. Record real task acknowledgements and mature same-cohort follow-up reviews before promoting strategy changes or accepting the full executive capability.

No `master` merge, deployment, paid connectors or model calls, public posting, KOL messages or trading were performed.
