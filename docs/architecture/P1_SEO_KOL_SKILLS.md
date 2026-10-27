# P1 — SEO and KOL Growth Skills: real evidence integration

This delivery adds two **explicitly selectable, read-only** growth skills. It reuses LogEarn's existing user, channel, KOL CRM, tagging, ranking and transaction definitions without touching any underlying Growth metric SQL.

## SEO: Google Search Console manual evidence

**Current source**: authenticated operator's manually supplied Search Console Search Analytics rows. There is **no live Google Search Console OAuth/API connector**. The system cannot attest that an uploaded row actually originated at Google; every result carries `source: gsc-manual-export` and `verifiedWithGoogleApi: false`.

- `POST /api/ai-analysis/growth-seo/import`: 1–500 structured daily query/page rows from at most 31 calendar days for **one HTTPS URL-prefix property**. Query, page, country, device, click, impression, average position, and optional CTR are validated. Duplicate dimension rows, impossible numbers, cross-origin pages, future dates, invalid sources, and untrusted URLs are rejected. The upload is stored once using a canonical SHA-256 checksum including its owner ID.
- `GET /api/ai-analysis/growth-seo/imports`: list the logged-in user's import snapshots.
- `POST /api/ai-analysis/growth-seo/preview` with `{"snapshotId":"gsc-..."}`: owner-scoped read-only summary from the **selected immutable import**.
- Agent tool `get_seo_performance` consults the latest imported snapshot covering the requested date labels, optionally filtered to `siteUrl`. It returns a distinct `seo_search` evidence metric and original snapshot provenance, not a fabricated Growth user metric. No stored snapshot covering the selected period means unavailable evidence, **not zero impressions**.
- Opportunity heuristic for imported queries: at least 50 impressions, CTR below 3%, average observed position from 3 to 15. This is a **triage heuristic**, not a predicted traffic gain or statistical significance claim.
- A Search Console export may suppress anonymous queries or only contain top-ranked result rows. The rows here are marked `export-limited` and never treated as a whole-site traffic total. Search Console date labels are **not** LogEarn's Bangkok business-day boundaries. GSC clicks cannot be directly equated with user registration, product activation, or trading.

Example JSON for an operator's actual export, provided after obtaining real source data:

```json
{
  "siteUrl": "https://example.com/",
  "source": "gsc-manual-export",
  "startDate": "2026-10-18",
  "endDate": "2026-10-18",
  "rows": [
    {
      "date": "2026-10-18",
      "query": "holder distribution",
      "page": "https://example.com/holders",
      "country": "usa",
      "device": "MOBILE",
      "clicks": 2,
      "impressions": 80,
      "position": 8.2,
      "ctr": 0.025
    }
  ]
}
```

The import is designed for JSON extracted from an operator-owned GSC Search Analytics export containing date + query + page dimensions; ordinary flattened CSV exports may need reshaping. The current API and global JSON body parser can impose a lower request-size limit than 500 long rows. You can import multiple immutable batches; the tool selects the latest **single** covering snapshot rather than adding potentially overlapping exports.

## KOL: existing owner CRM and true observed effects

- Agent tool `get_kol_performance` calls `src/data/kolRanking.js`'s established `rankingMetrics` method through `src/ai/growth/kolReader.js`; it does not implement another attribution rule. It reads at most 20 of the most recently updated owner-scoped CRM KOL profiles (25 hard maximum), including their linked accounts and CRM tagged members.
- `POST /api/ai-analysis/growth-kol/preview` with `{"start":<epoch-ms>,"end":<epoch-ms>,"source":"all"}` uses the same read-only adapter with **no model call**. It requires the existing real Hologres analytics source; otherwise it reports unavailable.
- Results contain KOL labels and counts of **observed** users, analyses, validated transactions and available USD trade volume, with missing metrics explicitly null if coverage is incomplete. Linked private member identifiers and raw transaction details are excluded.
- Tagged/linked user behavior does **not** prove KOL incremental acquisition, causation, or marginal ROI. Members can overlap across KOLs. Trade volume is not protocol or platform revenue. Missing source facts and unknown transaction amounts are never replaced with zero.
- The specialist tools intentionally require `businessScope.source='all'`. A specific website channel filter does not properly constrain GSC exports or CRM tagging and is therefore rejected rather than silently ignored.

## Running a specialist analysis

1. Open the AI Analysis page. Import your actual GSC JSON or preview existing KOL observational data **before** making a model call.
2. For an SEO analysis, select `SEO · Search Console`, choose business goal `conversion` or `activation`, and use source `all`.
3. For a KOL analysis, select `KOL · 合作归组`, choose `conversion` or `revenue`, and use source `all`.
4. If you explicitly submit an AI analysis, `POST /api/ai-analysis/analyze` accepts `"skillId":"seo-organic"` or `"skillId":"kol-impact"`. The selected skill is saved with the analysis record and passed to the Growth Planner, which prioritizes its authorized read-only tools. All existing model-call guards, checkpoints, approval rules, and owner-scoped evidence assertions still apply. `POST /growth-plan` also accepts `skillId` for a no-charge plan preview.

**There is no automatic paid SEO/KOL model work.** Import, list and evidence previews do not enqueue AI analysis. General daily automatic analysis remains opt-in, and production deployment is not performed.

## Checks and acceptance

- `growthSeo.test.js`: validation of authentic-shaped rows, unsafe URLs and duplicates, conservative CTR and coverage calculations.
- `growthSeoIntegration.test.js`: real PostgreSQL owner isolation, immutable SHA-256 idempotence and concurrent importing.
- `growthKolReader.test.js`: existing KOL ranking reuse, exclusion of member identities, partial upstream data and Hologres unavailable behavior.
- `growthSpecialistTools.test.js`: agent registry discoverability, distinct evidence IDs, owner context, source restrictions, and prioritized skill selection.
- `growthSpecialistHttp.test.js`: authenticated import, preview, denial of other owners, no AI queue use.
- Frontend recovery harness and full frontend build are checked by GitHub Actions.

Codex should independently review the accuracy of exported GSC Search Analytics input mapping, non-incremental KOL tagging semantics, incomplete external watermarks, API payload sizes and the production migration. The GSC live OAuth connection is intentionally deferred until an approved authentication and secrets-storage design exists.
