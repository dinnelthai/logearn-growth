# P0 AI Worker Recovery — Codex Acceptance Handoff

Status: **implementation submitted in Draft PR #1**, not merged or deployed.
Scope: AI infrastructure only. Growth metrics, funnel definitions, attribution and trading analysis remain untouched.

## Implemented components
- PostgreSQL atomic `pending -> processing` claim, unique execution token, renewable execution lease, fenced snapshots/final writes.
- Cross-worker `ai_analysis_call_guard` for each paid model round. Unknown/started calls never replay.
- SQLite append-only detailed model response, tool result, prompt-repair and validated-final checkpoints.
- `runTask({resumeRows})` replays received model responses without calling the model and reuses completed read-only tool results. Only missing read-only tools/new rounds execute, after ownership and budget checks.
- `resumePlan` rejects missing rounds, mismatched context/prompt, bad tool checkpoints, partial earlier rounds, and unconfirmed paid work.
- The original `context_payload` TEXT stores the exact JSON string sent as the model user message to prevent PostgreSQL JSONB key-order drift.
- A `resume-investigation` Bull handler reclaims expired execution only after shared paid-call and SQLite trace consistency checks. New queries use the persisted, unchanged context and are fenced to the new lease token.
- A `finalize-validated` handler completes a validated final output without model/tool calls.
- Owner-scoped manual `POST /api/ai-analysis/:id/resume` and cooperative `POST /api/ai-analysis/:id/cancel`, plus UI buttons and checkpoint status.
- Offline tests, SIGKILL persistence test, real PostgreSQL 16 / Redis 7 contention test and frontend build in GitHub Actions.

## Configuration

Before applying these changes: `cd backend && npm run migrate:ai` (review SQL and take a database backup first).

| Environment variable | Default | Effect |
| --- | --- | --- |
| `AI_LEASE_MONITOR_ENABLED` | disabled | Periodically logs expired processing leases; **never** sends paid requests |
| `AI_RECOVERY_FINALIZE_ENABLED` | disabled | Automatically schedules **finalization-only** attempts for expired leases; requires verified final checkpoint |
| `AI_RECOVERY_RESUME_ENABLED` | disabled | Automatically schedules checkpoint-aware multi-round continuation; **may** incur new provider charges |
| `AI_TASK_MAX_CALLS`, `AI_TASK_MAX_TOKENS`, `AI_TASK_TIMEOUT_MS` | existing defaults | Hard per-task bounds; recovered model calls count toward budgets |

All automatic recovery flags are opt-in. Do not enable `AI_RECOVERY_RESUME_ENABLED` before Codex and staging review. Manual resume is an explicit user action and may bill only for genuinely missing model rounds. Provider calls already in flight cannot be retroactively cancelled.

## Codex verification checklist (not certified by authoring code)

1. **Clean-checkout test**: `cd backend && npm ci && npm test`; review all CI jobs on the exact PR head commit, not a previous commit.
2. **Migrations**: upgrade an existing PostgreSQL database and initialize a fresh one; confirm idempotence and rollback instructions. Confirm `context_payload`, `cancel_requested`, `execution_token`, `lease_expires_at` and `ai_analysis_call_guard`.
3. **Multiple Worker contention**: run two independent Bull Workers sharing PostgreSQL and Redis. Only one can own a pending analysis or an expired lease. Stale owners must fail to write snapshot/final report.
4. **Provider crash windows**: kill before paid-call start, after shared `started` but before provider response, after response but before `received`, and after `received`. Ambiguous cases must **never** replay. Check actual DeRouter idempotency/cost policy before claiming exactly-once behavior.
5. **Partial tool replay**: kill after the first of two read-only tools; resume only the missing tool, then continue to the next LLM round. Verify full evidence ledger, token/cost accounting, and no duplicated model call.
6. **Stable source snapshot**: force different JSONB key ordering and verify exact `context_payload` is used. Attempt different owner, source, goal or prompt version and ensure hard failure.
7. **SQLite deployment topology**: verify a shared persistent trace store across replicas, or require pinning the resumed Worker to the original volume. If the original journal is unavailable, recovery must fail closed. SQLite is **not** automatically shared merely because PostgreSQL is shared.
8. **Cancellation**: cancel during queue, tool query, and in-flight provider call. A previously sent provider call may bill, but no later call or result commit may succeed.
9. **Frontend**: authenticated user can inspect status, cancel pending/running work and manually request resume only after expiry. Other owners cannot inspect checkpoints, cancel or resume.
10. **Budget and ops**: expired-lease monitor does not enqueue loops uncontrollably; paid resume is disabled by default; verify alerts, logging redaction, rollback and rate limits.

## Explicit limitations
- Re-running an *unfinished read-only tool query* can duplicate computation or generate a different observation if upstream data changes. Saved original context and evidence checks do not confer globally exactly-once tool semantics.
- Provider exactly-once charging cannot be guaranteed without provider-supported idempotency; unknown paid-call states block instead.
- This implementation has **not** been deployed to production, independently security-audited, or validated against real paid DeRouter calls. Do not merge this Draft PR based on unit tests alone.
- User requested Codex to perform the independent verification and production acceptance.
