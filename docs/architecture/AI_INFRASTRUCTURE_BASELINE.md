# LogEarn AI infrastructure — architecture baseline (2026-10-27)

> Status: **initial evidence-backed inventory**, not a production-readiness certification. Target: lower maintenance while preserving all existing Growth business behavior.

## Non-negotiable boundaries

- Do **not** refactor Growth metric definitions, SQL, ingestion, funnels, retention, trading, attribution, or business database schemas as part of this work.
- AI may call existing business capabilities only through narrow, authenticated, bounded tool adapters. It must not reimplement business calculations.
- One AI agent runtime and one observability system at a time; avoid unnecessary services or new databases.
- All changes must be independently testable and reversible. No direct deployment or default-branch modifications in this change.

## Repository baseline (source verified at branch `feat/ai-growth-agent`)

| Concern | Existing implementation | Decision |
| --- | --- | --- |
| LLM relay | `backend/src/ai/llm/config.js`, `client.js`, `providers/openai.js`; DeRouter-compatible OpenAI base URL | **Retain** as initial provider seam; test provider behavior before introducing another SDK |
| Agent investigation | `backend/src/ai/business/runner.js` | **Retain pending gap analysis**; has a bounded investigation loop, structured output validation, trace hooks and call/token/time ceilings |
| Business tool access | `backend/src/ai/business/tools/registry.js`, `adapters.js` | **Retain**; predeclared tools, owner/scope checks, tool budgets, controlled filters; extend only for validated gaps |
| Evidence | `backend/src/ai/business/evidence.js` | **Retain**; immutable stored evidence, citation-ID and cited-value checks; semantic factuality still requires independent evaluation |
| Prompts and call journal | `backend/src/ai/business/trace.js` | **Retain**; prompt hashes and unknown paid-call guard already exist |
| Queuing | `backend/src/queues/queues.js`, `workers/aiAnalysisWorker.js` | **Retain for now**; implementation uses `bull` even though both `bull` and `bullmq` appear in package dependencies. Do not migrate without proving value |
| Knowledge/RAG | `backend/src/ai/rag/` | **Evaluate actual usage** before adding a memory service |
| UI | `frontend/src/pages/aiAnalysis.js` | Preserve current interface; only adjust for verified missing run-state visibility |
| Scheduler | `backend/package.json` has a deliberately disabled `scheduler` script | Continuous autonomous research is **not verified enabled** |

## Important observed maintenance risks

1. **Framework duplication risk:** replacing an already-working queue, investigation loop, evidence store and trace journal with an all-in-one framework may increase—not decrease—complexity. A Mastra or LangGraph PoC must demonstrate a concrete missing capability and a reduced maintenance burden.
2. **Provider abstraction is partly cosmetic:** the deployed LLM client currently instantiates the OpenAI-compatible provider, despite Anthropic SDK/provider files existing. Do not claim hot-swappability until contract tests pass.
3. **Cost accounting requires configuration:** `AI_RELAY_COST_PER_1K_INPUT` and `AI_RELAY_COST_PER_1K_OUTPUT` default to zero. Treat absent prices as *unknown*, not proven free. Validate actual provider usage and reporting.
4. **Docs are not acceptance evidence:** `AI_GROWTH_AGENT_ALL_PHASES_COMPLETE.md` claims completion and performance savings; independently validate tests, real data, restart behavior, budgets, and instrumentation.
5. **Continuous research and true resumability:** queue retries, trace journaling and bounded loops exist, but these alone do not establish checkpoint/resume of an in-progress multi-step investigation.

## Decision matrix before introducing a framework

Accept a new component only when it:
- passes a real DeRouter tool-call and budget-limit test;
- preserves owner/scope authorization and evidence reproducibility;
- survives process interruption without accidental duplicate paid requests;
- offers observable progress (run ID, stage, last completed step, last error, costs when known);
- demonstrably removes more custom maintenance code than it adds;
- can be rolled back independently without changing Growth calculations.

## First implementation slices

1. **Characterization and runtime acceptance tests** — verify the current end-to-end report save/retrieve/feedback flow, with mocked LLM by default and explicit opt-in paid tests. Capture failing tests before changing behavior.
2. **Progress and resume contract** — one stable run-state API and append-only state transitions; reuse existing DB and Bull queue. Validate restart and unknown-paid-call behavior.
3. **Provider contract** — test current DeRouter response normalization, tool calls, token/cost reporting, errors and cancellation; do not add a second provider yet.
4. **Skill packaging** — document Growth analysis procedures and their allowed tool IDs. Keep data access and metric calculations in existing services.
5. **Framework PoC only if gaps remain** — compare maintenance, behavior and deployment count with current runtime; no parallel production runtimes.

## Execution log / verification

- GitHub connector inspected package config, AI runner, tool registry, evidence, trace, queue and worker sources.
- Local read-only test run against the *uploaded backend ZIP copy*, **not confirmed identical to the GitHub HEAD**: `node --test test/agentFoundation.test.js test/agentEvidence.test.js test/agentTrace.test.js` → **4 passed, 0 failed**, Node v22.16.0.
- GitHub HEAD CI, production traffic, external data quality, and paid DeRouter calls: **not verified**.
- No business logic modified by this baseline PR.

## Handoff

**Next task:** verify repository HEAD dependency install and run the 3 existing tests against HEAD; then implement only the smallest missing piece (progress/resume visibility) with failing characterization tests first. Every future PR should include: change boundary, exact tests, evidence of behavior, known gaps, and rollback instructions.


## Implementation checkpoint 1 — durable status fallback (2026-10-27)

- New: `backend/src/ai/business/jobStatus.js` pure projection for status from an authenticated persisted analysis record when Bull's bounded job history has evicted the job.
- Changed: `GET /api/ai-analysis/jobs/:jobId/status` falls back to `records.getAnalysisRecord(jobId, authenticatedOwner)` only if the queue job is absent. If neither exists, retain 404; do not disclose other owners' records.
- Correctness: completed/failed statuses expose persisted terminal results/errors; missing active job + pending/processing database row returns `state: "unknown"`, `resumable: false`, and no fabricated percent.
- Limitation: unique retry queue IDs are not the analysis ID, so their evicted-job status is available via the durable `GET /api/ai-analysis/:id` endpoint rather than this fallback. Full checkpoint/resume is **not implemented**.
- Local verification: `node --check` on modified route and new helper; `node --test test/jobStatus.test.js test/agentFoundation.test.js test/agentEvidence.test.js test/agentTrace.test.js` **8 tests passed** on uploaded local backend copy with these exact changes applied. This is **not** a CI run against a fresh GitHub checkout or production integration test.
- Next: add HTTP contract tests for this fallback; only then consider further progress-state changes.

## Implementation checkpoint 2 — HTTP contract coverage (2026-10-27)

- Added `backend/test/jobStatusHttp.test.js` using a loopback Express server with stubbed queue and owner-scoped record access (no production Redis, Postgres, or paid LLM calls).
- The HTTP contract now tests: live job progress, live job ownership rejection (403), pruned completed result, pruned failed error, pruned processing `unknown` without fake resumability, missing record (404), and no cross-owner result exposure.
- Local test command: `NODE_PATH=<path-to-extracted-existing-node_modules> node --test test/jobStatusHttp.test.js test/agentApi.test.js test/agentFoundation.test.js test/agentEvidence.test.js test/agentTrace.test.js test/jobStatus.test.js`.
- Local result: **10 passed, 0 failed** against a local source copy with this branch's status fallback. Node v22.16.0. Not a fresh-checkout CI result; dependency installation and production integration still unverified.
- No business calculation or database schema touched.
- Next highest-priority gap: investigate durable checkpoint semantics and retry safety for paid calls. Do not enable automatic replay for an ambiguous provider request.

## Implementation checkpoint 3 — paid-call replay safety (2026-10-27)

- New `backend/src/ai/business/retrySafety.js`: a pure fail-closed retry policy. Only failed analyses with a reliably readable **empty** model-call journal can use the old restart-from-beginning retry API.
- Changed `POST /api/ai-analysis/:id/retry`: before transitioning a failed record to pending, query the existing SQLite `agent_calls` journal scoped to the authenticated owner and analysis ID. Any prior call (started, unknown **or received**) returns HTTP 409. Journal read errors fail before state mutation.
- Added `backend/test/retrySafety.test.js` and `backend/test/retrySafetyHttp.test.js`: policy cases and HTTP tests for paid-call guard, owner isolation, inaccessible journal, and empty-journal retry.
- Local verification: policy unit tests **3/3 pass**; HTTP retry test + existing `agentApi.test.js` and `agentTrace.test.js` **3/3 pass** in a local copy of the uploaded backend with the exact retry gate applied; Node 22.16.0. GitHub CI / deployment / paid DeRouter E2E not run.
- **Not true checkpoint/resume**: received model responses still cannot be automatically reconstructed into a resumed conversation; successful partial work intentionally blocks blind retry rather than being replayed. A durable response/evidence checkpoint with idempotency and restart tests is the next implementation milestone.
- This safety gate preserves Growth business calculations, schemas, and metrics.

## Implementation checkpoint 4 — durable received-response journal (2026-10-27)

- Changed `backend/src/ai/business/runner.js` to persist the **actual model response content** alongside existing cost/model/token metadata in the current SQLite `agent_calls.result`, before parsing, validating, or invoking subsequent tools.
- The existing owner-scoped `traceStore.list(ownerId,runId)` can read this content from a newly instantiated store. No new tables or third-party dependencies.
- Added `backend/test/agentResponseCheckpoint.test.js` and expanded `backend/test/agentTrace.test.js`: response is saved before a later tool failure, failed provider calls are not marked as received, and a new trace-store instance can recover the exact saved response only for its owner.
- Local test command: `NODE_PATH=<existing-upload-extracted-node_modules> node --test test/agentResponseCheckpoint.test.js test/agentTrace.test.js test/agentFoundation.test.js test/agentEvidence.test.js test/jobStatus.test.js test/retrySafety.test.js`; **11 passed, 0 failed** on a local source copy with this change, Node v22.16.0.
- **Limitations:** the transcript, completed tool calls and investigation state are not checkpointed yet. Recording an LLM response is necessary but insufficient for automatic workflow resume. Keep paid-call retry guards active; never claim mid-run auto-resume is complete. Record contents are sensitive and must remain server-side with owner authorization; do not expose raw model responses on public job status endpoints.
- GitHub CI, process-kill restart test, production and real paid DeRouter integration: **not yet verified**.

## Implementation checkpoint 5 — durable investigation results (2026-10-27)

- Reused the existing SQLite `agent_calls.result` JSON rather than adding tables or services. A new `traceStore.appendInvestigation(context,round,index,query,result)` writes one confirmed tool result at a time in an IMMEDIATE transaction.
- Enforced the authenticated run owner, the exact trace/round and `received` state; results append in order. Identical duplicates are idempotent, conflicting rewrites fail, and incomplete model responses cannot record tool results.
- `runner.js` checkpoints each successful tool execution before proceeding to the next tool, while keeping the previous runtime behavior intact.
- New `backend/test/agentInvestigationCheckpoint.test.js` covers durable read-back, owner isolation, ordered writes, identical replay, conflicting replay and unknown model calls.
- Local verification: Node v22.16.0; `NODE_PATH=<existing-extracted-dependencies> node --test test/agentInvestigationCheckpoint.test.js test/agentTrace.test.js test/agentFoundation.test.js` -> **4 tests passed** on a patched local copy. Not CI against clean checkout.
- Still **not automatic mid-run resume**. Reconstructing messages, tool execution sequence, budget, and checkpoint consistency before worker restart remains outstanding; unknown paid calls must continue to block restart. Raw tool results may contain sensitive information and must remain server-side.

## Implementation checkpoint 6 — read-only checkpoint inspection (2026-10-27)

- Added `backend/src/ai/business/checkpointState.js` to inspect a persisted AI call journal without sending requests. It distinguishes empty journals, saved responses, partially recorded tool batches, ambiguous paid-call attempts, mismatched prompt versions and invalid tool checkpoints.
- `traceStore.list()` now returns trace IDs and round indexes alongside existing journal metadata. No schema change.
- New authenticated `GET /api/ai-analysis/jobs/:jobId/checkpoint` looks up the owning analysis record **before** reading its private SQLite call journal. Response returns counts and a reason code only; it omits raw prompts, responses and tool results.
- Added unit tests (`backend/test/checkpointState.test.js`) and HTTP authorization test (`backend/test/checkpointHttp.test.js`).
- **Local verification:** a mirrored standalone checkpoint inspector passed 4/4 unit tests with Node 22.16.0. HTTP test is committed but not verified against a clean repository checkout or actual database connections. GitHub CI and full end-to-end tests remain outstanding.
- **Important:** `canAutoResume` is always false by design. This is an inspection feature, not permission to restart a paid model call. Saved responses, prompt versions, source-data snapshots, and completed tool results must be validated together before any actual resume orchestration is enabled.
- Next slice: ensure complete investigation transcript can be reconstructed deterministically and independently verified against the original model prompt, source snapshot and tool outputs; then test process termination/restart without duplicate DeRouter calls. Avoid additional AI frameworks until these tests expose a proven need.

## Implementation checkpoint 7 — read-only transcript reconstruction (2026-10-27)

- Added `backend/src/ai/business/transcriptRecovery.js` to reconstruct the ordered assistant/tool-evidence messages from previously journaled **received** model responses. It calls no LLM, tool, database or queue and cannot trigger paid replay.
- Explicitly refuses missing rounds, unresolved paid requests, unmatched prompt versions, partial/invalid tool results, and intervening model validation turns whose corrections were not journaled by the original runner.
- Added `backend/test/transcriptRecovery.test.js` covering two-round tool conversation, unknown paid calls, gaps, prompt drift, partial tool results and read-only behavior.
- Local verification: Node 22.16.0, syntax check + `node --test backend/test/transcriptRecovery.test.js` with a mirrored copy of the committed source and prior checkpoint-inspector module: **4/4 passing**. This is not a clean GitHub checkout, integration test or production test.
- **Critical safety boundary:** the original input context/data snapshot is supplied to reconstruction but has **not been cryptographically matched to the one originally sent**; validation-repair messages are not journaled. Thus `canAutoResume:false` remains mandatory, even when a transcript is reconstructed. Do not enable Worker auto-resume or duplicate paid calls until these gaps and restart tests are resolved.
- Business metric calculations, ingestion, SQL and trading logic untouched. No new dependencies, database migrations or external services.
- Next implementation slice: persist and verify initial-context fingerprint and each post-response validation-repair message; only then consider an explicit safe resume controller.

## Implementation checkpoint 8 — source-context fingerprint (2026-10-27)

- `runner.js` now computes SHA-256 over the exact JSON string sent as its original `context` user message, and persists `contextHash` with each received model response in the existing SQLite trace record. No migration.
- `transcriptRecovery.js` requires every recovered response to match the hash of the supplied original context. A mismatched source context or older un-fingerprinted journal is **blocked**, not assumed equivalent.
- Added mismatch and legacy-journal regression cases in `transcriptRecovery.test.js`; added an assertion in `agentResponseCheckpoint.test.js`.
- Local mirrored module tests: **5/5 passed** on Node 22.16.0. The runner-level updated assertion and clean GitHub CI have not yet been executed end-to-end.
- Still **not automatic resume**: transcript reconstruction does not prove the external data remains available, preserve validation repair messages, or handle unknown paid calls. Do not expose raw saved prompt/context/response externally.
- Next: journal validation-repair turns, then add restart/replay simulator proving no duplicate LLM or tool calls before any production resume switch.
