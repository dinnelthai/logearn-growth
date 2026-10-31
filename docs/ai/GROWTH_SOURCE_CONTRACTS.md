# Growth Agent 2.0 — Channel source and historical-period contracts

> Branch: `codex/ai-comprehensive-upgrade`. Audited 2026-10-31 at source/test SHA `14f42ba61c785866e918df3ca841bf4525f35bc2`.
>
> This is a **code + fixture/CI contract audit**, not an assertion that real X, Search Console, Hologres, CRM or referral data have been connected, are current, or passed a paid-model end-to-end test. Unknown is not zero. No source here authorizes automatic external collection or paid calls.

## Source contract matrix

| Source / tool | Period and as-of semantics | What may be observed | Strict limitation |
| --- | --- | --- | --- |
| GSC / `get_seo_performance` | Saved PT calendar dates; owner + selected Search Console property. Bangkok business timestamps are converted to requested *date labels*, **not matching hourly windows**. Exact or overlapping stored daily aggregates only; partial days lower coverage. | Property clicks, impressions, CTR, weighted position, and period-matched daily rows. | Query/page top-N dimensions are valid for original snapshot, not for an overlapping sliced week; missing dates cannot become complete-week zeros; GSC does not prove registration/trading. |
| X / `get_content_growth` | Manual content is scoped to the selected Bangkok publish dates; third-party X is a **separate 30-day lookback** ending at the analysis cutoff. Post observations and daily follower totals must have `observed_at < end`. | At most 20 stored public posts/account and their pre-cutoff cumulative observations, optional 24h/48h comparable-age snapshots, manual content stats independently. | Not daily incrementality, recommendation ranking score, or verified acquisition. A newer stored value cannot overwrite historical snapshot truth. Upstream samples and post-history retention are incomplete. |
| X followers / `get_follower_quality` | `seen_at` within report `[start,end)`; post classification/count only if `posts_at < end`; scan status only if latest `updated_at < end`. | Seen records, categories with cut-off-safe classification and post-analysis counts. | `x_follower_audit` is mutable, not immutable history. Later classifications become `unknown`; `reviewed` lacks `reviewed_at`, so historical review counts are **unknown**, not 0. Latest scan completion after cutoff cannot be backfilled. |
| KOL / `get_kol_performance` | Owner-scoped CRM profile association with `source=all`; remote Hologres watermark `as_of >= end` required; tagged account aggregate read. | Observed associated users, analysis, completed transactions, volume where verified. | Profiles may overlap; CRM relation is not evidence of KOL incremental or causal acquisition. Trade-data failure nulls trade metrics; volume is not platform income. |
| Referral/invite / `get_referral`, `get_invite_conversion` | Existing verified binding relations, event/identity checks, 24-hour flow maturity where requested, business-day retention maturity; owner and task scopes enforced by existing services. | Recorded link visits, validation/account confirmation, verified bindings, observed downstream analysis and separately observed next-generation referral. | Binding is neither first registration nor incrementality. Unknown/missing bindings and immature follow-up cannot be converted to success/failure zeros. |

## Implementation changes in this pass

- `backend/src/ai/business/tools/contentAdapters.js`: the X daily follower query now requires `observed_at < report.end`; historical follower progress is included only when its latest `updated_at` is prior to cutoff. If a stored follower's posts were analyzed after cutoff, the historical classification is shown as `unknown`, and historical post-analysis counts do not include future work. The single mutable `reviewed` flag is not used to pretend historical review completion time is known.
- `backend/src/ai/business/tools/weeklyModuleSummaries.js`: `reviewedRecords` and per-category `reviewed` are omitted when observation timing is unknown, rather than emitting fabricated zero values.
- CI now explicitly runs `contentAgentEvidence.test.js`, `xContentAgentEvidence.test.js`, `aiWeeklyModuleSummaries.test.js`, `gscWeeklyWindow.test.js`, `growthKolReader.test.js`, `inviteAssociation.test.js`, `inviteRegistration.test.js`, `referralInsights.test.js`. The GSC/KOL/invite implementations were reused, not duplicated.

## Validation and remaining gates

- **Fixture-level correctness:** historic future-knowledge leakage, read-only and owner filters, GSC stored PT date slicing, KOL watermark/overlap, verified invitations and referrals; checked by AI Contract CI workflow.
- **Unverified live acceptance:** selected GSC property and true PT daily coverage; third-party X post snapshot/retention freshness and historical follower capture; CRM/member matching and true Hologres trade watermarks; referral registration identity cross-coverage; source scan truncation and query cost; actual platform fee revenue. Inspect each with existing authorized read-only connection. No live records or external APIs were accessed in this audit.
- **Product decisions still pending:** attribution keys, trusted maturity/denominator coverage for registration→parallel product use→transaction journey, and operator-confirmed North Star.

New v5 reports must distinguish source collection from evidence interpretation. Old saved reports are never rewritten to retrofit data which was collected afterward.
