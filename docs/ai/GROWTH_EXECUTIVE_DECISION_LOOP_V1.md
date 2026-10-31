# Growth Executive Decision Loop v1 — Implementation and Acceptance

Branch: `codex/ai-comprehensive-upgrade`. This is a tested **first vertical slice**, not completion of the entire autonomous Growth Executive roadmap or a production acceptance record.

## Confirmed operating contract

- Canonical North Star: period-distinct `active_users` based on Chip Distribution view/drill-down. Repeated views by a user in a period count once. New/returning analysis users are separate, supporting diagnostics. Real trades, revenue and unmatched trade identities are separately classified, not mixed into the North Star.
- Existing PostgreSQL `ai_growth_agent_targets` and SQLite `gw_goals` remain independent. The Executive queue recognizes only an explicit, month-scoped `active_users` workspace goal. It never synthesizes a target; it does not claim a cross-database target migration.
- Existing multi-goal reporting score remains unchanged for historical compatibility. Newly constructed daily brief reports add `executiveFocus` for `active_users`, with a target and attested score **only** when the existing snapshot passes maturity and coverage checks.

## Implemented safe flow

1. The existing leased scheduler already gates workspace ticks behind `GROWTH_WORKSPACE_DISCOVERY_ENABLED=1`. Within this opt-in, `GROWTH_EXECUTIVE_CYCLE_ENABLED=0` can disable the new cycle. It reuses existing `liveObservation.loadObservation` and the backend's read-only/cached Hologres North Star queries.
2. The cycle verifies two adjacent completed Bangkok days, exact metric types, immutable snapshot identity, complete historical coverage and source-event watermark before saving owner-scoped `verified` aggregate evidence. Unavailable/incomplete data results only in a tracked data-quality issue, **not** a fictitious fall in users. An observed zero is not an unknown.
3. Declines are considered at baseline ≥20, absolute decline ≥5 and relative decline ≥20%. The confirmed `active_users` signal is highest priority. Existing `gw_problems` and `gw_problem_events` retain long-lived problem history without repeatedly re-creating issues.
4. At most **one** investigation draft is proposed per cycle, favoring `active_users` then supporting metrics. The existing `gw_actions` store deduplicates drafts; none are automatically accepted, executed, paid for or published.
5. Dashboard `executive` exposes the canonical target status, latest **daily** verified `active_users`, ranked unresolved cases, actions awaiting approval, executed actions with matured review dates, and overdue owner-owned operation tasks. Frontend allows only acceptance of an internal draft.
6. `goalProgress` rejects a daily unique-user count as a monthly distinct-audience goal. No summing daily distinct counts. Existing `weekly_core` legacy progress remains unchanged.
7. The paid signal gate still fails closed for missing history/watermark, truncation or source lag >1h; an optional module warning alone does not block a verified activation investigation. Paid dispatch remains separately opt-in, subject to existing budgets and safe retry guards.

## Validation

- `backend/test/growthExecutiveCycle.test.js`: verified signals, owner isolation, deduplication, unavailable source, trusted recovery, monthly vs daily, invalid windows, leased workspace composition and no automatic external/paid actions.
- `backend/test/growthDailySignalGate.test.js` and `backend/test/growthWorkspace.test.js`: paid preflight coverage and period contracts.
- Production validation remains pending: live identity/event completeness, real Hologres/Worker and web app behavior, realistic end-to-end timing. A passing CI check is **not** live-source proof.

## Outstanding executive upgrades

Cross-database goal unification, autonomous read-only root cause investigation with multi-hypothesis evidence, assignments and SLAs, durable task reminder delivery, economic opportunity comparisons, prediction/experiment evaluation and a proven policy learning loop are **not yet implemented** by this increment. These cannot be marked complete by changing a document or prompt. Previously open live v5 acceptance remains open.

No `master` merge, production deploy, paid data collection/model use, outbound publishing or trading is authorized by this work.
