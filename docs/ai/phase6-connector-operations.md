# Phase 6 — dynamic SEO skill and operational readout

## Dynamic planning
`planner.js` no longer snapshots supported tool IDs during module load. It receives a trusted per-task capability list. The business-analysis Worker computes that list for an explicitly selected SEO specialist using `defaultRegistry().listCapabilities` with current authenticated owner, scope, period and task; the planner allows only the catalog intersection. `foundation.prepare` persists the selected subset and execution rechecks it; resume intersects it with the live catalog.

SEO skill now composes first-party GSC `get_seo_performance`, internal growth channels and funnel, and optional `openseo.saved_rankings`. The optional tool is never shown for unconfigured/revoked connections. Model context remains bounded by the existing transport budget.

## Minimal management/status
`GET /api/growth-agent/connectors` returns no credentials, URLs, project IDs or owner identifiers. Status is `disabled`, `unmapped`, or `configured_authorized` (this is NOT proof of live connectivity); `connectivity` reports `not_verified`, and paid research stays disabled. Provider enable/disable is an **operator-only server deployment setting** `OPENSEO_ENABLED` and owner mapping; there is deliberately no unaudited API that can write secrets or enable spending.

## Operational checklist
1. Explicitly run existing AI PostgreSQL migration against verified target, with approval, and review schema changes/backup. The added finance tables are not required for free read-only OpenSEO.
2. Pin OpenSEO deployment source/version to matching `get_rank_tracker` structuredContent shape; create and check rank tracker in upstream product.
3. Configure `OPENSEO_MCP_URL`, exact `OPENSEO_MCP_ALLOWED_HOSTS`, `OPENSEO_API_KEY` and owner/project/tracker mapping as server secrets. Enable only after manual live protocol and authorization check; loopback HTTP exception is local-development-only.
4. API `/connectors` checks configured binding but does not probe upstream. `/capabilities` shows only currently authorized tools. Revoke via removing owner mapping or `OPENSEO_ENABLED=0`; new calls fail closed and prior evidence retains owner isolation.
5. Watch service status, MCP response sizes, HTTP 401/403, schema drift, run status and `lastCheckedAt`. A missing ranking is not proof of being below the checked depth.
6. Keep paid research OFF until supplier pricing, receipts, strict task authorization and shared ledger migrations are verified.

### Test and rollback
`cd backend && node --test test/growthPlanner.test.js test/growthSpecialistTools.test.js test/capabilityCatalog.test.js test/capabilityGateway.test.js test/capabilityEvidence.test.js test/openseoConnector.test.js test/connectorPlanning.test.js test/gscService.test.js test/gscClient.test.js test/gscHttp.test.js test/gscIntegration.test.js`.

These tests were authored, but full Node suite, real database, OpenSEO deployment and end-to-end LLM behavior are **not verified** in this GitHub-only environment. No master modification, no external call, and no migration executed. Rollback via removing `OPENSEO_ENABLED` followed by reverting this phase-6 commit.
