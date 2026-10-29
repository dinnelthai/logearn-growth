# Phase 1 — reviewed capability catalog (seo branch)

## Contract and scope
`backend/src/ai/business/tools/capabilityCatalog.js` is an in-process catalog for **project-shipped and code-reviewed** connectors. Production loads no external connector in this phase. It does not install code, start an MCP server, or enable paid tools.

- `createCapabilityCatalog({ legacyIds, extensions, assertOwner })` uses the existing legacy handler for legacy IDs without changing their parameters or evidence semantics.
- Extension declarations require namespaced `id`, semantic numeric `version`, `description`, `supportedScopes`, `permission` (`owner-read` or `owner-write`), `cost` (`none` / `paid` / `unknown`), bounded input and output schemas, `execute`, `project`, trusted server-side `enabled` and `authorize`.
- Legacy capabilities retain their published ID, version, schema, scopes, limits and dispatch. No existing GSC or SEO/KOL adapter was changed.
- Extension input is strict and limited to 8192 JSON bytes, projected output to 16000 JSON bytes. Extensions must explicitly project; extra fields fail validation. All paid or unknown-cost extensions are blocked until Phase 5.
- Declaring “read only” or “free” is not a grant of access. Phase 2 will add centralized task-scoped, connection- and owner-aware enforcement; Phase 3 adds persistent evidence and model-safe projection to new extension results.

## Review / validation
A dedicated `backend/test/capabilityCatalog.test.js` covers compatibility, SEO/KOL behavior, dispatch, disabled/paid rejection, duplicate and malformed declarations, input schema and output projection. Recommended commands:
```bash
cd backend
node --test test/capabilityCatalog.test.js test/growthSpecialistTools.test.js
node --test test/gscService.test.js test/gscClient.test.js test/gscHttp.test.js test/gscIntegration.test.js
```
No database migration or environment variable changes. Rollback this commit to restore the exact pre-catalog execution path. The catalog must **not** be used for external calls before gateway and evidence phases.
