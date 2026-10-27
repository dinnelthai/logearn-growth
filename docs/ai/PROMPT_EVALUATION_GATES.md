# Growth Agent prompt evaluation foundation
This module is a **fail-closed offline promotion gate**, not a complete autonomous optimizer.

The existing Node.js 22 built-in `node:test` runner is used for regression tests. No new Agent framework is introduced. Keep DeRouter as the single provider. Candidate generation, durable prompt registry, blinded holdout execution, shadow/canary traffic, atomic activation and rollback must be implemented before enabling promotion in production.

- `evaluateCandidate` requires explicit independent case results, including owner/scope isolation, evidence integrity, unknown-vs-zero, paid-call fencing and prompt injection.
- Its caller must supply externally measured baseline quality, cost and latency budgets. It cannot turn an LLM self-score into an independent result.
- `authorizePromotion` refuses promotion unless `AI_PROMPT_AUTO_PUBLISH=1` **and** a non-agent approval matches the candidate hash. This function grants only a proposal to promote; it DOES NOT write live prompts.
- Default is OFF. Do not set the flag in deployment until atomic persistence, shadow evaluations and rollback are verified.
- Tests: `cd backend && node --test test/promptGate.test.js`.

A real implementation must keep fixtures hidden from the candidate generator and version evaluator rules outside the agent's write permissions.

## Candidate evaluation, approval and rollback (implemented foundation)

The owner-scoped SQLite registry now supports proposed → evaluated → approved → active, with immutable content hashes and one-step rollback. Authenticated `/api/growth-agent/prompts/*` endpoints expose candidate creation, review/approval, activation and rollback. Independent evaluation ingestion is intentionally **CLI-only**; a model or HTTP client cannot submit a forged score to the server.

1. Use Promptfoo's normal CLI on a held-out suite and save a v3 JSON export. Cases must contain metadata.caseId entries for all critical invariants; the export must contain one real OpenAI-compatible provider, actual measured latency and monetary cost, no errors, and no missing cases.
2. Run `node scripts/ingestPromptfooEvaluation.js OWNER CANDIDATE results.json 0.85 1.0 8000` from the backend working directory. The numbers represent independently established baseline quality, maximum total evaluated cost and maximum per-case latency in milliseconds. Do not treat arbitrary numbers as evidence.
3. Review the candidate and use the authenticated approval endpoint, passing the current expectedVersion. Activation also requires `AI_PROMPT_AUTO_PUBLISH=1` and refuses a moved baseline. `AI_PROMPT_RUNTIME_ENABLED` remains disabled by default; the live runner is not connected to the registry yet, so activation in the registry alone does NOT change model behavior.

A candidate's review must not read hidden case answers; only the separate operator evaluator reads them. No production prompts may be swapped until replay stability, canary comparison, persistent evaluation provenance, and automatic rollback have been independently verified. The included `promptfooconfig.yaml` is a **synthetic offline assertion smoke suite only**; it must never count as a qualifying evaluation of a candidate.
