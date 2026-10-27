# P1 — Search Console API settings in the LogEarn Growth web console

This change turns the previous manual-only GSC import into a real **server-side, read-only Google Search Console API** workflow in the existing AI Analysis page.

## What the website now shows

The SEO area is organized around the connected API, while JSON import remains a fallback:

1. **Connection status**: API credential readiness, Google permission errors, allowed site list and selected Search Console property (URL-prefix or `sc-domain:`).
2. **Property settings**: choose and persist the owner's default Search Console property. The browser never receives an OAuth bearer token or private key.
3. **Date synchronization**: explicitly choose a GSC date range of up to 31 days, ending at least two calendar days before the current day, and click **从 Google 同步数据**. The backend queries `dataState=final`, not provisional live data. Concurrent identical sync requests are serialized with a PostgreSQL advisory transaction lock; the most recent sync is reused for 15 minutes.
4. **SEO performance report**: site-level daily clicks, impressions, CTR and average position; daily trend; top search queries; top pages; candidate high-impression/low-CTR queries. Property totals come from the **date+byProperty API**, never from summing anonymized/truncated query or page rows.
5. **Sitemaps**: inspect already submitted Sitemap paths, warnings, error counts, pending state and last download. This does **not** submit/delete Sitemaps, and submitted/indexed counts are not total indexing coverage.
6. **URL inspection**: inspect an exact HTTPS URL under the owner's selected property and display Google's indexed-version coverage, crawl, canonical and robot index status. It is **not** a live URL indexability test and **does not** request indexing.
7. The existing `seo-organic` AI Skill now **prefers owner-scoped synchronized API snapshots** for exactly matching GSC date labels, and falls back to manually imported limited rows when no matching synchronized report exists. Neither path pretends that a Bangkok business-day interval equals the GSC Pacific-time interval.

## Server-side authorization

A verified Search Console property in the **Google website** does not automatically authorize LogEarn's backend. You must provide credentials to the backend service and limit which authenticated LogEarn owner IDs can see which properties.

Preferred: a server-held Google service account private key, with the service account's email granted **read access** to the relevant Search Console property and Search Console API enabled in the Google Cloud project. Store the key in the server's secret manager or a securely mounted JSON file. Never paste a service account key, OAuth refresh token or access token into the LogEarn web UI or GitHub.

Example **server environment** (placeholders only):

```sh
GSC_OWNER_ID=YOUR_LOGEARN_AUTH_USER_ID
GSC_ALLOWED_SITES=sc-domain:yourdomain.com,https://www.yourdomain.com/
GSC_SERVICE_ACCOUNT_FILE=/secure/mounted/gsc-readonly-service-account.json

# Equivalent alternative if already securely mounted as a Google ADC JSON key:
# GOOGLE_APPLICATION_CREDENTIALS=/secure/mounted/gsc-readonly-service-account.json

# Optional for multiple trusted LogEarn owners, replacing the two variables above:
# GSC_OWNER_SITES_JSON='{"owner-one":["sc-domain:yourdomain.com"],"owner-two":["https://other.com/"]}'
```

`GSC_SERVICE_ACCOUNT_JSON` is also supported for a server-controlled secret store, but is never read from a frontend field. `GSC_ACCESS_TOKEN` can be used as a temporary server-only token for integration verification but is not refreshed automatically; use a managed long-lived authorization strategy in production.

The backend uses Google's **webmasters.readonly** OAuth scope. The owner allowlist is intersected with sites actually returned by the Google API. No authenticated user can enumerate all properties accessible to a shared Google service account. A saved property cannot bypass the current allowlist or Google permissions when selecting or syncing it.

Apply the reviewed additive PostgreSQL migration before using this page:

```sh
cd backend
npm run migrate:ai
```

The migration adds `ai_growth_gsc_settings` and `ai_growth_gsc_snapshots`, with user ownership, property ID, immutable finalized evidence and capture timestamps. No Growth analytics or trading tables are changed.

## Authenticated internal APIs

- `GET /api/ai-analysis/growth-seo/gsc/connection`: status and authorized sites; no private credentials.
- `PUT /api/ai-analysis/growth-seo/gsc/settings` with `{"siteUrl":"sc-domain:yourdomain.com"}`: server-authorized owner-specific default site.
- `POST /api/ai-analysis/growth-seo/gsc/sync` with `{"startDate":"2026-10-01","endDate":"2026-10-21"}`: finalized Google Search Analytics fetch and immutable journal.
- `GET /api/ai-analysis/growth-seo/gsc/report`: latest saved site report; optional exact `startDate` and `endDate`.
- `GET /api/ai-analysis/growth-seo/gsc/sitemaps`: read-only submitted Sitemap status.
- `POST /api/ai-analysis/growth-seo/gsc/inspect` with `{"inspectionUrl":"https://yourdomain.com/path"}`: read-only Google indexed URL status.
- Existing manual import endpoints remain available for offline GSC snapshots.

No background cron, production deployment, Search Console site mutation, automatic paid model call or dollar-cost feature flag was enabled by this change.

## Quality and limitations

- Google Search Analytics can omit anonymized queries and internally limits top query and page rows. `queryRowsReturned`, `pageRowsReturned`, completeness warnings and truncation flags are explicit.
- The **property totals** are computed from daily `byProperty` rows; if a date is not returned, it is **not automatically interpreted as zero traffic**. Unreported dates and coverage state are shown.
- The API uses Google Search Console **PT date labels**, unlike LogEarn's business reports using Asia/Bangkok days. Avoid causal comparisons between those windows without reconciliation.
- URL inspection is Google's indexed-state view, not live testing. Sitemap coverage does not prove indexed percentage for the entire property.
- Synchronized reports are immutable. The SEO Agent tool requires an exact matching saved GSC date-label range or an existing manual import; it does not silently initiate an on-demand Google sync during a paid model run.
- The connection status is truthful: if server credentials, per-owner property permission or service-account Search Console access are missing, the page says so instead of claiming a successful integration.

## Testing and rollout

CI includes `gscClient.test.js`, `gscService.test.js`, `gscIntegration.test.js`, `gscHttp.test.js` and the existing frontend recovery-page suite. They cover server-only authorization, HTTPS/domain validation, owner isolation, concurrent sync idempotency, property totals versus query subsets, Sitemap / URL inspection fences, and no paid AI queue calls.

**Independent staging acceptance by Codex**: review credentials and least privilege; check Google sites.list for the chosen owner; run one real finalized Search Analytics sync; confirm property total matches Google's corresponding report with the same date label and aggregation; review partial date rows and pagination; inspect one authorized and one rejected URL; verify repeat sync dedupe, database migrations and rollback. Production credentials and deployment require an explicit separate decision.

Official Google API reference:
- https://developers.google.com/webmaster-tools/v1/sites/list
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/webmaster-tools/v1/sitemaps/list
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
