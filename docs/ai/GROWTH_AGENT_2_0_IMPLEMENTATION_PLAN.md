# LogEarn Growth Agent 2.0 — 实施路线图

Branch: `codex/ai-comprehensive-upgrade`  
Scope: Business Brain, Growth Intelligence, Operating Memory, Decision Engine and Learning Loop.  
Progress snapshot (2026-10-31): 31 / 48 implementation checklist items have code and CI coverage in place (65%); live-source acceptance is tracked separately.  
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

## Phases and acceptance

### Phase 0 — Baseline and handoff (in progress)

- [x] Confirm target branch and current repository architecture.
- [x] Inventory existing modules, metrics, evidence and action/review stores.
- [x] Add durable architecture and handoff documents.
- [x] Run focused Node tests on the target branch (CI or local checkout).
- [x] Record exact pre-existing test failures separately from regressions.

Acceptance: a new agent can start from the handoff document without asking for project history again.

### Phase 1 — Business Brain (v1 implementation started)

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
- [ ] Validate SEO/GSC date semantics, X snapshot semantics, KOL CRM association and referral/invite contracts.
- [ ] Add channel / product / cohort breakdowns only where the source supports them.
- [ ] Keep source watermark, coverage, freshness, scope and definition version with each metric.
- [ ] Separate platform revenue from trade volume and partner/collaboration ledger records.

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

Implementation note (2026-10-31): v5 now ranks observed positive and negative signals by goal relevance and evidence completeness, and uses affected-population deltas only when comparing user-count metrics. It selects relevant tools from the current authorized capability list and requires minimum necessary, non-duplicate investigation. The analysis contract supports 2–3 competing root-cause hypotheses with supporting/counter evidence, missing evidence and a discriminating query; proposed tools are checked against task capabilities and hypothesis evidence IDs against the owner-scoped evidence store. This is partial implementation, not completion of the checklist: numeric query-cost ranking remains open until trusted tool cost/latency metadata exists, and live-result quality still needs validation.

- [ ] Prioritize business questions by goal relevance, affected population, change magnitude, evidence confidence and query cost.
- [ ] Generate competing root-cause hypotheses and identify the cheapest authorized query that distinguishes them.
- [x] Look for growth opportunities as well as declines (v5-only, goal-ranked observed increases; not proof of replicability).
- [ ] Generate actions with problem, hypothesis, expected impact basis, resource/owner, primary metric, target, maturity window and review condition.
- [ ] Validate each suggested metric against the registry and the actual retrospective service.
- [ ] Avoid duplicate or already-disproved actions.

Acceptance:
- a conclusion distinguishes fact, hypothesis and unknown;
- each recommendation is actionable and tied to a valid review metric;
- no causal or ROI claim is generated without supporting design/data.

### Phase 5 — Operating Report and custom periods

- [ ] Reframe weekly report around executive judgment, business health, lifecycle funnel, channel effectiveness, root causes, opportunities, next actions, previous-action review and data gaps.
- [ ] Keep module coverage and technical audit information in secondary / collapsible sections.
- [x] Preserve custom start/end collection windows; weekly is only the default preset.
- [x] Compare with the immediately preceding equal-length window only when metrics are comparable.
- [x] Clearly show the timezone and whether end time is inclusive/exclusive.

Acceptance:
- the report leads with the most important business decision, not a list of 12 module statuses;
- the operator can choose a custom collection period;
- each number remains evidence-linked and date-aligned.

### Phase 6 — Learning Loop

- [x] Connect accepted AI suggestions to the existing owner-scoped operation task workflow through explicit linking; require an already-created fixed-cohort task and exact source-scope match.
- [x] Record actual execution, a fixed-cohort pre-task baseline, observe-until date and post-completion evidence in the AI retrospective.
- [x] Review only after the metric’s maturity window; the fixed-cohort evidence requires at least three complete post-completion business days.

Implementation note (2026-10-31): AI retrospective now resolves the single owner-scoped operation task linked to an executed suggestion. It revalidates the source scope and exact task/suggestion completion timestamp, then queries the same frozen audience over equal-length (3–14 complete Bangkok business days) windows: baseline ends before task creation; observation begins on the first complete business day after task completion. Both windows use one Hologres snapshot. The model receives aggregate-only cohort metrics, coverage and the observe-until timestamp; no member IDs or user-level rows are projected. Multiple linked tasks, source mismatches, incomplete source reads and immature windows are explicitly unavailable/waiting. This is observational evidence, not causal attribution.
- [ ] Store observed-supported / observed-contradicted / insufficient outcomes separately.
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
