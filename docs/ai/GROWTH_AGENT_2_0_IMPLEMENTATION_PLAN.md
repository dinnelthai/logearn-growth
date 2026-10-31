# LogEarn Growth Agent 2.0 — 实施路线图

Branch: `codex/ai-comprehensive-upgrade`  
Scope: Business Brain, Growth Intelligence, Operating Memory, Decision Engine and Learning Loop.  
Progress snapshot (2026-10-31, latest source/test HEAD `8a7f71c98fce502b68a056671ee9a95304507abb`): **39 / 48 implementation checklist items (81.3%)** have code and focused CI-contract evidence; **9 remain open**. This is NOT live-source, platform-revenue availability or real-model acceptance.  
Rule: incremental upgrade; reuse existing analytics, tools, evidence, workspace and storage.

## Product definition

The goal is not “write a weekly report”. The goal is a virtual Head of Growth that can explain:
1. what changed in the business;
2. where the most important growth constraint or opportunity is;
3. which causes are supported vs. still hypotheses;
4. what should be done next, with owner/resources/validation;
5. whether prior actions were actually executed and what was observed afterward.

The report is only one interface to this operating capability.

## Current architecture to reuse

| Responsibility | Existing implementation |
|---|---|
| Formal metric semantics | `backend/src/ai/business/metricRegistry.js`, `backend/src/analytics/businessPriorities.js` |
| Business aggregate reports | `backend/src/services/businessReport.js`, `backend/src/data/*`, `backend/src/analytics/*` |
| Tool authorization and evidence | `backend/src/ai/business/tools/registry.js`, `foundation.js`, `evidence.js`, `modelEvidence.js` |
| Weekly module manifest | `backend/src/ai/growth/weeklyCoverage.js` |
| Weekly model context | `backend/src/ai/business/weeklyContextV4.js` |
| Historical AI suggestion memory | `backend/src/db/aiRecords.js#getAnalysisMemory`, `contextBudget.js#compactMemory` |
| Growth problems, actions and reviews | `backend/src/ai/growth/workspace/store.js` |
| Action suggestion workflow | `backend/src/ai/growth/actionWorkflow.js` |
| Learning from mature reviews | `backend/src/ai/growth/agentLearning.js` |
| Existing KOL / SEO operations | `backend/src/ai/growth/kolOperations.js`, `seoOperations.js` |
| Existing user operation tasks | `backend/src/routes/operationTasks.js`, `backend/src/analytics/activityMonitor.js` |

Do not build a second analytics engine, CRM, operations task manager, metric registry or evidence store.

## Progress audit — 2026-10-31 (branch-only)

**Scope and accounting.** Source-of-truth is this branch's 48 checkboxes, not comparison with `master`. A checked item means implementation with focused/CI evidence; it **does not** mean the live LogEarn sources, Worker, paid model, external collectors or operator outcomes have passed acceptance. Newly checked in the reconciled audit: two Phase 5 weekly-report items and the Phase 2 platform-vs-partner revenue identity contract. Subsequent source/test commits are separate from documentation-only changes.

| Phase | Code/CI checked | Open | Remaining boundary |
|---|---:|---:|---|
| 0 — Baseline/handoff | 5/5 | 0 | Maintain handoff after changes |
| 1 — Business Brain | 8/10 | 2 | Real authorized context check; operator approval of North Star/product map |
| 2 — Growth Intelligence | 4/8 | 4 | Full module audit, mature product journey, supported breakdowns, per-source metadata |
| 3 — Operating Memory | 7/8 | 1 | Cross-channel outcome links only with reliable keys and windows |
| 4 — Decision Engine | 4/6 | 2 | Cost-aware ranking / cheapest discriminating query lack trusted cost metadata |
| 5 — Operating Report | 5/5 | 0 | New v5 report contract/UI exist, **live model and report-quality acceptance pending** |
| 6 — Learning Loop | 6/6 | 0 | Frozen-cohort end-to-end acceptance pending; v2 direct cohort review currently maps only `active_users → analysis_users` |
| **Total** | **39/48 (81.3%)** | **9** | **No real-source/Worker/paid-model acceptance implied** |

**Latest verified checks:** AI infrastructure [run 41184069508](https://github.com/dinnelthai/logearn-growth/actions/runs/41184069508) passed on `76ec311df688860f93b72b930641cf1c3cd3ef03` (strict v5 weekly partial-report fallback); frontend [run 41184123727](https://github.com/dinnelthai/logearn-growth/actions/runs/41184123727) passed on exact audited HEAD `030c0ed8993a049485f4a064d48cef1f661dfa05`. Earlier intermediate AI CI runs failed before corrective commits; do not cite them as final failures. No full real-source / Worker / paid-model acceptance was performed in this review.

**Known code/UI debt, not counted as new roadmap checkboxes:**
- **Resolved in subsequent code:** weekly UI now derives the count from the persisted manifest and retains the 13th `operations-timeline` module without inventing a 13th module for historical 12-module snapshots. Frontend regression [41184785074](https://github.com/dinnelthai/logearn-growth/actions/runs/41184785074) passed.
- New v5 reports require seven lifecycle stages and evidence-linked opportunity/previous-action blocks. Invalid new-model sections are saved as an explicitly **partial** report, not silently accepted as fully validated, and not automatically re-billed; an archived v4 weekly report viewed in the browser is not evidence that v5 ran successfully.
- `reviewMetrics.js` permits `active_users`, `new_users`, `returning_users`, `activation_rate` and `d7` in the existing retrospective service, but the separate fixed-cohort v2 observational classifier currently makes a direct semantic comparison only for `active_users`. Do not claim cohort learning for registration/trade/retention metrics.
- Read-only source acceptance must establish data freshness, identity/match coverage, mature denominators, real Hologres query latency, GSC PT-day alignment and X/KOL/invite snapshots. Missing data is unknown, never zero.

**Execution order:** (1) Phase 2 audit and source-safe funnel/economics, (2) Phase 3 stable operational outcome links, (3) Phase 4 query-cost ranking only after measured metadata exists, (4) already-authorized read-only v5/Operating Memory/fixed-cohort acceptance plus operator confirmation. Keep paid calls, deployments, migrations and external writes separately approval-gated.

### Continuation checkpoint — 2026-10-31 (source-specific provenance / CRM independence)

- Source/test HEAD: `8a7f71c98fce502b68a056671ee9a95304507abb`. [AI infrastructure 41186244825](https://github.com/dinnelthai/logearn-growth/actions/runs/41186244825): **success** for AI Contract, AI Integration, AI Frontend, including source-specific provenance and CRM Hologres-isolation regressions.
- **Resolved:** `backend/src/ai/business/tools/registry.js` now persists actual GSC API synced/manual imported times, bounded X observed-post times, follower-scan progress update times, verified KOL snapshot `asOf` and their source-version identities. Missing source times remain null, not the event-store timestamp or the query wall clock. `backend/src/ai/business/modelTransport.js` exposes those keys through the model evidence allowlist. Manual CRM collaboration ledger no longer inherits Hologres event freshness and remains independently queryable when Hologres status is down.
- **Boundary:** GSC fetch timestamp does not prove PT daily completeness; X latest sampled post does not prove all-account freshness; KOL event snapshot does not prove manual CRM relation completeness; manual collaboration ledger has no independent complete-through watermark. The complete per-metric/per-source metadata checklist **remains unchecked** until every remaining compound tool contract and real-source verification is covered. Detailed matrix: `docs/ai/GROWTH_SOURCE_CONTRACTS.md`.
- **Progress unchanged: 39/48 = 81.3%, Phase 2 4/8, 9 open.** This completes material backend sub-work but not a broadly defined roadmap item. No paid calls, migrations or deployment.

### Continuation checkpoint — 2026-10-31 (GSC/X/KOL/invite source semantics)

- Source/test HEAD: `14f42ba61c785866e918df3ca841bf4525f35bc2`. [AI infrastructure run 41185823229](https://github.com/dinnelthai/logearn-growth/actions/runs/41185823229): **success** (Contract + Integration + Frontend); the new source-contract test step is a required CI gate.
- **Fixed:** X historical daily follower totals now require snapshot `observed_at` prior to analysis end. Historical follower-progress states are limited by `updated_at`; latest mutable follower post classifications after cutoff become `unknown` and untimestamped review status is omitted rather than 0. Existing owner-level source scopes remain unchanged.
- **Verified in automated fixtures:** GSC PT-date completeness and bounded stored snapshots; X cutoffs and unknown future reviews; KOL CRM observed aggregate identity and Hologres watermark; invite/referral verified relations, distinct registration and maturity windows. See `docs/ai/GROWTH_SOURCE_CONTRACTS.md` for the full per-source matrix and honest limitations.
- **Accounting:** one *code/contract* validation checkbox newly closed. Overall **39/48 (81.3%), 9 open**; Phase 2 **4/8**. A test can establish guardrails but not freshness or identity-completeness in production. Live Hologres/GSC/X/referral acceptance, real model output, external paid probes, and comprehensive source audit still pending.
- **Next:** finish complete per-module source audit and measured watermark/coverage; then valid channel/product/cohort breakdowns and mature registration-to-trade journey. No paid source sync or production migration was performed.

### Continuation checkpoint — 2026-10-31 (Phase 2 ledger/platform revenue split)

- Code/test HEAD: `ac7b5a410211bb257033943a729ad852e0d16fb8`. AI Contract and AI Frontend jobs of [run 41185478559](https://github.com/dinnelthai/logearn-growth/actions/runs/41185478559) passed at documentation authoring time; AI Integration job was still running. Verify the final run conclusion before claiming full CI success.
- **Resolved:** the `get_channel_economics` tool previously filed owner-specific CRM ledger aggregates under `trade_revenue`. New evidence uses `collaboration_economics` (version 1); formal platform revenue is `trade_revenue` version 2 with `platform-revenue-unavailable` adapter. The v1 archived metric remains readable, not silently remapped. Business Brain is `logearn-business-brain-v2` with metric dictionary version 2, and the new model context still obeys the 22KB check in AI Contract.
- **Explicit boundary:** no actual platform trading-fee/revenue source was connected or independently accepted, so real platform revenue must remain unknown. Human collaboration receipts are not platform income; trade notional is not fee revenue. This closes the **semantic separation** task, not a future real-revenue implementation.
- **Updated total: 38/48 (79.2%), Phase 2 = 3/8, 10 checkboxes open.** Remaining Phase 2 items are full source-contract audit, mature funnel, external/channel date semantics, supported breakdowns and per-source freshness/watermark coverage.

### Continuation checkpoint — 2026-10-31 (Phase 2 source contract + weekly UI)

- **Completed code/test increments:** preserve per-metric warnings and conservative registration/trade coverage in `backend/src/ai/business/tools/adapters.js` and `backend/src/ai/business/tools/registry.js`; add `backend/test/aiBusinessMetricsAdapter.test.js` and `backend/test/agentTools.test.js` regressions. Restore versioned 13-module weekly audit in `frontend/src/pages/aiWeeklyCoverageView.js`, `aiWeeklyDecisionView.js` and corresponding frontend tests; historical v4 remains 12.
- **CI observed:** [AI infrastructure 41184881554](https://github.com/dinnelthai/logearn-growth/actions/runs/41184881554) on `f9de3abb5eae27be99ba9129ee92c8b57a318a03` passed all three jobs; [Growth desktop UI 41184785074](https://github.com/dinnelthai/logearn-growth/actions/runs/41184785074) on `82f801864ff1cf4c6d114b77411adbfdb5527911` passed.
- **Progress rule:** this closes concrete sub-issues but does **not** complete the six broad Phase 2 checkboxes, and no full real-source acceptance was run. Checklist remains **37/48, 77.1%; Phase 2 remains 2/8**. Do not count new documentation commits as additional implementation milestones.
- **Next:** verify source-specific freshness/coverage from authorized read-only Hologres and the existing channel/SEO/X/KOL/referral adapters; pursue the mature registration→parallel product entry→trade journey without turning a multi-entry behavior map into an invented sequential funnel.

## Phases and acceptance

### Phase 0 — Baseline and handoff (code/CI complete; documents maintained continuously)

- [x] Confirm target branch and current repository architecture.
- [x] Inventory existing modules, metrics, evidence and action/review stores.
- [x] Add durable architecture and handoff documents.
- [x] Run focused Node tests on the target branch (CI or local checkout).
- [x] Record exact pre-existing test failures separately from regressions.

Acceptance: a new agent can start from the handoff document without asking for project history again.

### Phase 1 — Business Brain (v1 code/CI in place; real-source and operator confirmation pending)

- [x] Versioned LogEarn product baseline.
- [x] Four product capability roles and seven lifecycle stages.
- [x] Compact metric dictionary reused from the existing registry.
- [x] Explicit reasoning rules for zero/unknown, first-analysis vs registration, trade volume vs revenue and causality.
- [x] Bounded operating-memory projection from existing AI suggestions/reviews.
- [x] New v5 context protocol for new analysis tasks; old v1-v4 prompts remain replayable.
- [x] New weekly prompt framing around business outcomes rather than equal module coverage.
- [x] Run focused Node tests and validate the model-context projection under the 22KB cap in CI/isolated fixtures.
- [ ] Verify the new context on a real, already-authorized business report without starting an unnecessary paid model call.
- [ ] Review the product map and North Star intent with the operator; do not invent formal KPI definitions.

Acceptance:
- model can explain product roles and lifecycle stages;
- model distinguishes registered users, first observed analysis, active users, mature retention, trade volume and revenue;
- Business Brain is present in new v5 model input but absent from archived v1-v4 input;
- context remains <=22KB and contains only allowlisted aggregates / bounded history text;
- no new database migration or external paid call is required.

### Phase 2 — Growth Intelligence and source coverage

- [ ] Audit all existing business modules and their source contracts.
- [x] Fix product-to-trade analysis to use authoritative transaction facts; report identity/visit association separately.
- [x] Bound product-trade lookup to successful same-token analysis windows; cap result size and expose truncated/unknown coverage explicitly.
- [ ] Establish the registration → activation → product engagement → trade funnel with verified denominators and maturity.
  - Implemented supporting contracts: real `account_v2.created_at` registration cohort, mature 24-hour first-analysis activation, separate mature 7-day product-entry counts (chip/Holder/strategy/signal/repeat analysis), and identity-verified user-level trade conversion. Still open: prove event completeness and connect these as a valid business journey without forcing parallel product entries into one linear funnel; live-source acceptance remains separate.
- [x] Validate SEO/GSC date semantics, X snapshot semantics, KOL CRM association and referral/invite contracts (**code + fixture CI only; independent live-source acceptance pending**).
  - GSC uses PT day labels and read-only stored-day coverage; nonmatching/partial days cannot be promoted into verified full-week totals or site conversion. X historical post and daily follower snapshots require `observed_at<end`, and mutable scan progress after end is omitted; historical `reviewed` without a timestamp remains unknown, never zero. KOL uses owner CRM tagged accounts and an end-covering Hologres watermark, without claiming causal attribution. Referral/invite tests verify binding identity and mature windows, not newly registered users. Source matrix: `docs/ai/GROWTH_SOURCE_CONTRACTS.md`; [CI run 41185823229](https://github.com/dinnelthai/logearn-growth/actions/runs/41185823229) passed AI Contract, AI Integration and AI Frontend.
- [ ] Add channel / product / cohort breakdowns only where the source supports them.
- [ ] Keep source watermark, coverage, freshness, scope and definition version with each metric.
  - **Incremental code milestone (2026-10-31):** `query_metrics` now archives per-metric coverage/limits and keeps metric-specific warnings (registration scope, mature cohort, trade identity) alongside common warnings. The event snapshot no longer masquerades as a separate registration watermark; registration/trade watermarks remain explicitly `null` pending measured source freshness. `makeEvidence` already pins definition version, owner scope and period. Still open: standardize independent source watermarks/freshness across every non-metric specialty and validate against live sources. AI CI [41184881554](https://github.com/dinnelthai/logearn-growth/actions/runs/41184881554) passed (Contract, Integration, Frontend).
- [x] Separate platform revenue from trade volume and partner/collaboration ledger records (**code + contract tests; actual platform revenue remains unavailable**).
  - `get_channel_economics` now emits `collaboration_economics` v1, explicitly limited to owner-scoped CRM/KOL collaboration ledger; its USD/other-currency balances and ROI are never presented as platform trading revenue. `trade_revenue` remains as a separate v2 formal **unavailable platform revenue** metric without pretending there is an adapter; archived v1 evidence is not rewritten. Trade volume stays a transaction metric, not either revenue stream. `logearn-business-brain-v2` pins the distinction, versioned metric dictionary v2 and a 22KB bounded input. New weekly module names and tests reflect this. No direct platform fee/revenue source was built.

Acceptance:
- dashboard and AI use the same underlying analytics service;
- all important values trace to an evidence ID and formal metric definition;
- unknown or unmatched trade association is not reported as zero trades;
- channel exposure is not claimed as downstream conversion without identity/time evidence.

### Phase 3 — Operating Memory

- [x] Build an owner-scoped operations timeline by reusing existing growth activities, KOL collaborations, manual content, operation tasks, X, Search Console, KOL observations, AI report actions and specialist signals.
- [x] Normalize source, activity type, channel, period, target, assignee/status, KOL ledger amounts, activity delivery state and frozen outcomes without creating a parallel CRM/task manager.
- [ ] Link activity records to channel metrics and mature outcomes only where stable identifiers and comparable time windows exist; current KOL/activity links and settled activity outcomes do not establish cross-channel attribution.
- [x] Keep AI suggestion/review records in a separate layer from human-entered activities and channel observations.
- [x] Expose per-source available/empty/not-configured/unavailable/truncated coverage; missing community/training connectors remain unknown, not zero.
- [x] Reuse existing owner-scoped operator-authored business-change notes in the timeline as bounded, self-reported memory; no parallel journal or migration.
- [x] Preserve existing CRM collaboration-to-activity links as stable record references in the model-safe projection; these are explicit operational links, not channel attribution.
- [x] Join KOL observation aggregates to collaborations by shared CRM KOL profile ID, preserving aggregate-only metrics and non-causal semantics.

Acceptance:
- report can say which known activities occurred during a period;
- it does not say “no operations” just because the AI workspace has zero records;
- it can compare activity and outcomes without claiming causality by default.

### Phase 4 — Decision Engine

Implementation note (2026-10-31): v5 now ranks observed positive and negative signals by goal relevance and evidence completeness, and uses affected-population deltas only when comparing user-count metrics. It selects relevant tools from the current authorized capability list and requires minimum necessary, non-duplicate investigation. The analysis contract supports 2–3 competing root-cause hypotheses with supporting/counter evidence, missing evidence and a discriminating query; proposed tools are checked against task capabilities and hypothesis evidence IDs against the owner-scoped evidence store. This is partial implementation, not completion of the checklist: numeric query-cost ranking remains open until trusted tool cost/latency metadata exists, and live-result quality still needs validation. Strict analysis-contract-v2 snapshots additionally require distinct root-cause explanations and validate each discriminating query against the current authorized tool input schema, task source and date window; archived contexts retain legacy recovery behavior.

- [ ] Prioritize business questions by goal relevance, affected population, change magnitude, evidence confidence and query cost.
- [ ] Generate competing root-cause hypotheses and identify the cheapest authorized query that distinguishes them.
- [x] Look for growth opportunities as well as declines (v5-only, goal-ranked observed increases; not proof of replicability).
- [x] Generate actions with problem, hypothesis, expected impact basis, resource/owner, primary metric, target, maturity window and review condition (new analysis-contract-v2 snapshots require a complete execution plan, bounded review conditions, impact basis and exact source scope).
- [x] Validate each suggested metric against the registry and the actual retrospective service (shared reviewMetrics contract; only directly readable metrics are accepted for new suggestions).

Implementation note (2026-10-31): New analysis tasks pin `analysis-contract-v2` into their saved context. The shared `growth/reviewMetrics.js` map defines the exact metrics the retrospective service can rebuild (`active_users`, `new_users`, `returning_users`, `activation_rate`, `d7`) and provides the same value projection used by the actual retrospective job. The formal metric registry derives its `reviewAdapter` from this map and throws on any mismatch. `registered_users`, `registration_activation_rate` and `registered_trade_conversion_rate` remain valid business metrics but are explicitly not reviewable by the current retrospective service; new suggestions cannot pretend otherwise. New contract snapshots require a complete validated execution plan, impact basis, exact requested source scope and non-empty review conditions. Archived contexts without the v2 marker retain legacy validation for safe recovery.
- [x] Avoid duplicate or already-disproved actions: retain recent executed action labels (including insufficient reviews), instruct the planner not to repeat contradicted actions, and reject exact duplicates against both proposed and actual executed action text.

Implementation note (2026-10-31): Learning now retains up to three recent action records per metric, including the bounded business problem, actual executed action, observational label and reason. Contradicted actions are explicitly marked “do not repeat as-is”; insufficient reviews instead require evidence completion or a materially changed intervention, without being treated as disproved. Planner skills receive these action-level lessons, and their relevance contributes to investigation attention. The analysis contract also performs deterministic exact-text duplicate detection against both the original proposal and the recorded actual action, scoped by primary metric and source. Similarity-based rejection is intentionally not used to avoid false positives; the model is instructed to distinguish materially changed validation steps.

Acceptance:
- a conclusion distinguishes fact, hypothesis and unknown;
- each recommendation is actionable and tied to a valid review metric;
- no causal or ROI claim is generated without supporting design/data.

### Phase 5 — Operating Report and custom periods

- [x] Reframe newly created v5 weekly reports around executive judgment, lifecycle, channel findings, competing explanations, observed growth opportunities, next actions, previous-action review and data gaps (**code + fixture CI only; real model/output quality unverified**). Evidence: `weeklyReport.js` strict `weekly-report-v2` contract, `businessAnalysis.js` v5 snapshot gate, `aiWeeklyDecisionView.js`, `backend/test/aiWeeklyReport.test.js`, `frontend/src/pages/__tests__/aiWeeklyDecisionView.test.js`.
- [x] Keep module coverage and technical audit information in secondary / collapsible sections (**UI code + frontend CI only; manual live UI acceptance open**). Evidence: `<details>` sections in `frontend/src/pages/aiWeeklyDecisionView.js` and frontend regression tests.
- [x] Preserve custom start/end collection windows; weekly is only the default preset.
- [x] Compare with the immediately preceding equal-length window only when metrics are comparable.
- [x] Clearly show the timezone and whether end time is inclusive/exclusive.

Acceptance:
- the report leads with the most important business decision, not an exhaustive list of module statuses; the coverage manifest has 13 modules for new v5 snapshots, while legacy saved reports may contain 12;
- the operator can choose a custom collection period;
- each number remains evidence-linked and date-aligned.

### Phase 6 — Learning Loop

- [x] Connect accepted AI suggestions to the existing owner-scoped operation task workflow through explicit linking; require an already-created fixed-cohort task and exact source-scope match.
- [x] Record actual execution, a fixed-cohort pre-task baseline, observe-until date and post-completion evidence in the AI retrospective.
- [x] Review only after the metric’s maturity window; the fixed-cohort evidence requires at least three complete post-completion business days.

Implementation note (2026-10-31): AI retrospective now resolves the single owner-scoped operation task linked to an executed suggestion. It revalidates the source scope and exact task/suggestion completion timestamp, then queries the same frozen audience over equal-length (3–14 complete Bangkok business days) windows: baseline ends before task creation; observation begins on the first complete business day after task completion. Both windows use one Hologres snapshot. The model receives aggregate-only cohort metrics, coverage and the observe-until timestamp; no member IDs or user-level rows are projected. Multiple linked tasks, source mismatches, incomplete source reads and immature windows are explicitly unavailable/waiting. This is observational evidence, not causal attribution.
- [x] Store observed-supported / observed-contradicted / insufficient outcomes separately; feed fixed-cohort observational labels into the learning index and next investigation planner.

Implementation note (2026-10-31): Learning now accepts retrospective context v2 and reads the fixed-cohort baseline/effect payloads. The v2 classifier deliberately maps only `active_users → analysis_users`, whose semantics are directly comparable. It requires equal frozen audience size, zero unmatched accounts in both periods, and medium/high review confidence. All other primary metrics (including new_users, activation_rate, retention and trade conversion) remain `insufficient` until a valid cohort-level equivalent is implemented; global business metrics are never substituted. The same labels feed the owner-scoped judgement store and planner experience feedback. `getAnalysisMemory` now projects the baseline/effect JSON needed by the planner.
- [x] Use validated review outcomes to adjust investigation focus; do not auto-rewrite KPIs or model weights.
- [x] Maintain versioned strategy notes with expiry, scope, counter-evidence and rollback.

Acceptance:
- an executed action can be reviewed from baseline and after evidence;
- adoption alone is not success;
- ordinary before/after movement is not causal proof;
- prior negative or insufficient reviews can prevent blind repetition.

## Cross-cutting engineering constraints

- Keep existing analytics SQL and business semantics as the source of truth.
- Preserve owner isolation and tool permission boundaries.
- Model input remains aggregate-only; no raw user/event rows, wallet addresses, credentials or X post bodies.
- Keep the 22KB context budget, model-call limits, paid-call journal, timeout and recovery safety.
- Do not replay paid calls blindly.
- No migrations, deployments, production config changes, external paid collection or public posting without explicit approval.
- Use Node tests and the existing frontend test/build commands; do not call mock tests real-source acceptance.

## Handoff checklist

Before continuing:
1. Read `docs/ai/GROWTH_AGENT_HANDOFF.md`.
2. Read `docs/ai/LOGEARN_BUSINESS_BRAIN.md`.
3. Read this roadmap and `docs/ai/GROWTH_AGENT_UPGRADE_LOG.md`.
4. Confirm branch and HEAD.
5. Fetch current files before modifying; do not assume this plan supersedes code.
