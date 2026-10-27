# Growth Agent prompt evaluation foundation
This module is a **fail-closed offline promotion gate**, not a complete autonomous optimizer.

The existing Node.js 22 built-in `node:test` runner is used for regression tests. No new Agent framework is introduced. Keep DeRouter as the single provider. Candidate generation, durable prompt registry, blinded holdout execution, shadow/canary traffic, atomic activation and rollback must be implemented before enabling promotion in production.

- `evaluateCandidate` requires explicit independent case results, including owner/scope isolation, evidence integrity, unknown-vs-zero, paid-call fencing and prompt injection.
- Its caller must supply externally measured baseline quality, cost and latency budgets. It cannot turn an LLM self-score into an independent result.
- `authorizePromotion` refuses promotion unless `AI_PROMPT_AUTO_PUBLISH=1` **and** a non-agent approval matches the candidate hash. This function grants only a proposal to promote; it DOES NOT write live prompts.
- Default is OFF. Do not set the flag in deployment until atomic persistence, shadow evaluations and rollback are verified.
- Tests: `cd backend && node --test test/promptGate.test.js`.

A real implementation must keep fixtures hidden from the candidate generator and version evaluator rules outside the agent's write permissions.
