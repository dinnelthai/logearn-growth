# Phase 4 — OpenSEO saved ranking connector

**Implementation under test; real self-hosted service not connected.** Server source reviewed: `every-app/open-seo` commit `99d9a49c8cb742d54eddd64d09efbc5302f6db89`, `src/server/mcp/tools/get-rank-tracker.ts`. Confirm your deployed commit is compatible before enabling. This tool accepts `projectId` UUID, optional `trackerId` UUID, `offset`, `limit`, and returns `structuredContent.configs` or `structuredContent.{config,results}` with per-keyword `desktop.position` and `results.run`. A null position **does not prove rank below the requested depth**.

## Configuration (server only)
- `OPENSEO_ENABLED=1` (default OFF)
- `OPENSEO_MCP_URL=https://your-reviewed-host/mcp`
- `OPENSEO_MCP_ALLOWED_HOSTS=your-reviewed-host` (exact allowlist; no redirects)
- `OPENSEO_API_KEY` (server secret, never in the UI or model context)
- `OPENSEO_PROJECT_BINDINGS={"<owner-id>":{"projectId":"<uuid>","trackerId":"<uuid>"}}` (owner-to-project/tracker server mapping)
- Local development only: `OPENSEO_MCP_URL=http://127.0.0.1:4100/mcp`, `OPENSEO_MCP_ALLOWED_HOSTS=127.0.0.1`, `OPENSEO_ALLOW_LOOPBACK=1`

Only `get_rank_tracker` is called, after MCP initialize, notifications/initialized and tools/list confirmation. Supports JSON and SSE responses, session ID, paging offset/limit up to 30, session DELETE, redirects blocked. If trackerId is not mapped it reads configurations only and reports `tracker_mapping_required`, without choosing a possibly wrong domain. If disabled/missing binding, the catalog hides the tool and old GSC/Growth paths remain available.

Project/URL/credentials are **not** model inputs; `openseo.saved_rankings` input is only `offset` and `limit`. Backend must be able to reach the target address. Paid research and `run_rank_tracker` are still closed. No new DB migration.

Test: `node --test test/openseoConnector.test.js test/capabilityCatalog.test.js test/capabilityGateway.test.js test/capabilityEvidence.test.js test/gscService.test.js test/gscClient.test.js test/gscHttp.test.js test/gscIntegration.test.js`. Tests are mock HTTP protocol tests, **not** live OpenSEO verification. Real deployments must validate auth, mapping, structuredContent, data freshness, session behavior and upstream cost at the pinned version before enabling.

Rollback: unset `OPENSEO_ENABLED` (instant fail-closed), or revert this commit.
