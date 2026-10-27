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
