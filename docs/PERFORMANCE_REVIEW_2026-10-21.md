# Performance review — 2026-10-21

This review supersedes the deployment-readiness claims in the optimization summaries.

Retained: lazy page/data loading, modular ECharts, static asset compression and caching,
query monitoring, connection-pool settings, and concurrent-request coalescing.

Restored the SQLite metrics router and moved system monitoring to a separate router.
Fixed the login conversion SQL alias. Restored cache limits (256 entries, 4 MiB per
value, 64 MiB total), millisecond TTL precision, and invalidation during in-flight queries.
Redis L2 and probabilistic snapshot refresh are withdrawn until their invalidation and
snapshot-lifetime semantics can be verified. ENABLE_REDIS_L2 currently has no effect.

Removed the unused batch API/client with invalid imports and incompatible retention calls.
Removed the daily rollup API, worker and SQL: they were not compatible with the existing
connection API or business definitions (including first-seen dates, event identifiers,
identity resolution and timezone). Both Stage 2 deployment scripts now fail before any
mutation. The application no longer starts either experimental database refresh task.
Historical optimization/deployment guides are not approval to run those scripts or SQL.
Existing database objects are not altered or removed by this code change.

Disabled Service Worker caching of authenticated API responses; static asset caching remains.

Validation: backend 310 tests passed; frontend 253 passed, 4 skipped; production build passed.
No live database migrations, writes, or deployment performed.
