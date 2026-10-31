# Growth Agent 2.0 — Channel source and historical-period contracts

> Branch: `codex/ai-comprehensive-upgrade`. Latest audited source/test HEAD: `6540a7a353b5fadb080f016afa2aa2b8795ece0f`; [AI infrastructure CI 41204481078](https://github.com/dinnelthai/logearn-growth/actions/runs/41204481078) passed Contract, Integration and Frontend.
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
- **Product decisions still pending:** operator-confirmed North Star and attribution keys beyond existing verified identities. The registration→parallel product-use→trade journey now has a code/fixture contract below; its real-source completeness and freshness are not yet accepted.

New v5 reports must distinguish source collection from evidence interpretation. Old saved reports are never rewritten to retrofit data which was collected afterward.

## 2026-10-31 — Immutable evidence source watermarks (Phase 2 continuation)

Source/test HEAD `8a7f71c98fce502b68a056671ee9a95304507abb`. Source-specific timestamps are now extracted from the **already authorized, read-only adapter response**, rather than the generic Hologres event status or the wall clock. Registry evidence remains owner-scoped and immutable; only allowlisted statistics and provenance fields enter the model.

| Tool | Persisted evidence source version | Persisted source watermark | What the watermark **does not** prove |
| --- | --- | --- | --- |
| `get_seo_performance` | `sourceVersions.searchConsole = snapshotId` | `watermarks.searchConsole` = API `syncedAt` or manual export `importedAt`, ISO UTC; absent value is null | API fetch/CSV import timestamp does not prove a complete PT day, correct property, or verified organic conversion. Manual import is explicitly not Google freshness. |
| `get_content_growth` | `sourceVersions.x` = third-party X provider when collected, separate from `operatorRecords` manual content | `watermarks.x` = latest observed **bounded post** timestamp among available accounts; null if none | Not every account is current; no daily/new reach attribution or historical archive completeness. |
| `get_follower_quality` | `sourceVersions.followerScan` = mutable-scan-progress | `watermarks.followerScan` = latest actually observed pre-cutoff progress update; null if unknown | Not a complete historical follower roster; old scan/review state may not be recoverable. |
| `get_kol_performance` | `sourceVersions.kol` = adapter's verified remote snapshot ID where available | `watermarks.kol` = remote `asOf`, only on a result actually marked available | The CRM's manual tagged-account relationship is not independently versioned or causally attributed. |
| `get_channel_economics` | `sourceVersions.operatorRecords` = CRM manual collaboration ledger | `watermarks.operatorRecords = null`, `events = null` | Manual finance records have no independently verified complete-through watermark. This tool now reads local CRM without depending on Hologres status. |
| Ordinary remote/event analytics | Existing event-store snapshot ID | `watermarks.events` = remote event-store `as_of`; registration/trade watermarks only when independently available | Event-store freshness is not independent registration history, confirmed trade enrichment, or CRM completeness. |

- `backend/src/ai/business/tools/registry.js` implements the bounded provenance selection, preventing cross-source watermark substitution. `backend/src/ai/business/modelTransport.js` exposes only trusted specialist version/time keys already present in archived evidence; no arbitrary source metadata traversals.
- `backend/test/growthSpecialistTools.test.js` covers real timestamp paths and absent-source nulls for GSC API/manual import, X, KOL, follower scans and model projection. `backend/test/agentTools.test.js` checks CRM ledger has **no** event watermark and stays available when Hologres status is down.
- **Still open:** audit *every* remaining tool's compound event/registration/trade/relational provenance and per-source complete-through semantics, implement trustworthy freshness thresholds where supported, and validate independent source feeds in the real environment. The broad roadmap metadata checkbox remains unchecked; this is a subtask, not the full definition.

## 2026-10-31 — Registration → activation → parallel product use → trade journey

- **Read-only metric:** `query_metrics(["registered_user_journey"])`, also advertised as a signal of the existing `growth-overview` skill. This reuses the existing `growthInsights` job and analytics facts; no parallel event collector or alternate SQL definition was introduced.
- **Registration cohort:** `account_v2.created_at` in the selected Bangkok business period. It remains separate from first-observed/first-analysis users. If a source filter is selected, only accounts with an observed matching source can be included; unattributed accounts are not silently assigned to that source.
- **24-hour activation:** first chip analysis in `[registered_at, registered_at + 24h)`; only registrations with a full 24-hour observation window enter the denominator. Newer registrations remain pending. A zero mature denominator produces a null rate.
- **Seven-day product engagement:** chip analysis, Holder view, strategy start, signal view and repeat chip analysis are each independently counted within the first seven days after registration. Each uses the **same mature seven-day registration denominator**. They are parallel, overlapping entry points; counts must not be added and are not a serial funnel.
- **Trade conversion:** separate branch anchored on first chip analysis; transaction must fall within the following 168 hours. The denominator includes only mature first-analysis users with verified account identity. Unmatched identities are reported separately. This is user-level trade observation, not same-token attribution or causal proof. If trade facts/identity cannot be queried, trade numerator, denominator and rate stay null.
- **Completeness and freshness:** the model-visible journey includes the event-source `historyComplete` flag and `eventsCompleteThrough` where the existing snapshot exposes them. Evidence carries the event snapshot only for event-based behavior. Registration and trade source versions/watermarks remain null until independently measured; a Hologres event watermark is not substituted for either.
- **Breakdown contract:** the journey supports the existing authorized source scope and fixed audience scope, but does not advertise or accept device/version group-by. No unsupported cross-dimensional breakdown is inferred.
- **Model safety:** nested journey data is allowlisted as aggregate evidence; raw rows, user IDs, wallets and membership lists remain excluded. Weekly fact projection prioritizes mature activation, each parallel product-entry count and verified trade conversion.
- **Regression coverage:** `backend/test/aiBusinessMetricsAdapter.test.js`, `backend/test/agentTools.test.js`, `backend/test/aiWeeklyCoverage.test.js`, existing `backend/test/growthInsights.test.js` and `backend/test/growthCohortTrades.test.js`. Final [AI infrastructure CI 41187724624](https://github.com/dinnelthai/logearn-growth/actions/runs/41187724624) passed Contract, Integration and Frontend on source/test HEAD `a4f421400160d1a895e5032d7614062946e6f731`.
- **Acceptance boundary:** this closes the *code + fixture contract* for the journey, not live event completeness, independent registration/trade watermarks, or a production read-only data acceptance.

## 2026-10-31 — Registered cohort source segmentation, provenance and privacy

The only new dimension supported by the Growth Agent metric query is `query_metrics({metrics:['registered_user_journey'],dimensions:['source']})`. This deliberately uses the already-present `public.account_v2` registration cohort and its `facts.source` **observed event association**, not a first-touch acquisition or referral ownership proof.

- **Registration cohort**: counts all owner-scoped registered accounts in the authorized creation-period range; existing narrower `scope.source` means *observed-source attributed subset*, never all registrations that originated through that channel.
- **Source buckets**: up to four highest-count safe observed named labels, one `unknown` bucket for absent/unclassified associations and `other` for invalid or excess source labels. No account IDs or event rows are returned in this projection. Bucket populations and mature denominators reconcile with the same overall registration cohort.
- **Activation**: after registration, first observed chip-analysis within 24 hours. Only accounts with a full mature 24h follow-up enter the denominator; pending users are separate, rates null if eligible is zero.
- **Parallel product entry**: chip analysis, Holder, strategy, signal, repeat chip are **five independent 7-day observations**, each over the same mature registered cohort. They may overlap and must never be summed as an exclusive funnel.
- **Trade**: remains an **overall**, user-identity-verified post-first-analysis 7-day outcome. Individual source groups have no supportable trade attribution and intentionally contain **no** trade-rate fields.
- **Model citations**: `modelEvidence` retains allowlisted aggregate source counts. `weeklyCoverage.factsFromEvidence` reserves at most two source rows and 12 total source/overall numeric facts with evidence IDs. The immutable evidence query body and fingerprint include `dimensions:['source']`, distinguishing grouped versus ungrouped analysis and enabling valid claim checking. Other dimensional requests fail before expensive analytics.

**Remaining acceptance:** inspect the real `first_entry_source` data dictionary and representative values, historical source assignment drift, missing-attribution rates, registration account deduplication, event capture completeness and verified Hologres trade matching. This code/CI milestone is not a claim of incremental acquisition or verified channel attribution. Source segmentation is a business observation, not an experiment.

Source/test HEAD `7044ef3859c551002f543c0d8d178cbd142877dc`; [AI CI 41198640425](https://github.com/dinnelthai/logearn-growth/actions/runs/41198640425) passed contract/integration/frontend.

## 2026-10-31 — Full built-in tool-to-source audit (18 of 18)

**Authority:** `backend/src/ai/business/tools/sourceContracts.js` maps the complete `backend/src/ai/business/tools/registry.js#listToolIds()` catalog (18 built-in tools) to their own *source type, observation clock, and interpretation limitation*. `backend/test/businessModuleCatalog.test.js` refuses omissions/extra IDs and confirms audited module return values. This mapping is reviewed code, not an assertion that sources are configured or fresh.

| Built-in tool | Audited source | Time / cohort contract | Required limit on AI interpretation |
| --- | --- | --- | --- |
| `query_metrics` | Event + registered-account + verified trade aggregates (metric-dependent) | Per-metric source clocks, maturation and observed source scope | A shared events watermark cannot establish account/trade completeness |
| `get_funnel` | Hologres observed ordered events | Windowed event snapshot and maturity | Missing association and pending steps are not confirmed drop-off |
| `get_paths` | Hologres observed paths | Observed event snapshot | Not guaranteed whole-user history |
| `get_product_chain` | Observed analysis and separate verified transactions | Event, enrichment and real-trade matching windows | User association alone does not prove same-token or causal trading |
| `get_retention` | Hologres observed cohorts | Mature Bangkok business days | Immature/absent history is unknown rather than zero retention |
| `get_channels` | First observed analytics source and visits | Event snapshot | Source label is not first-touch acquisition or causal lift |
| `get_segments` | Fixed observed cohort/user set | Event snapshot | Segment overlaps cannot be added as unique users |
| `get_activity` | CRM activity fixed audience + observed member facts | Activity intersection and event as-of | Activity membership is not proof of channel-attributed trade |
| `get_operations_timeline` | CRM activities/KOL/content/tasks + GSC/X observations + AI record memory | Independent source clocks with bounded records | No common complete-through watermark or causal link implied |
| `get_channel_economics` | Owner CRM manually recorded collaboration ledger | Human-entered records/currencies | Not trading fees or platform revenue; no independent freshness watermark |
| `check_data_quality` | Hologres diagnostic events | Event snapshot and telemetry family coverage | History-complete flag does not prove every event family deployed |
| `get_seo_performance` | Selected property GSC API or limited manual import | PT calendar-day stored snapshot, collection timestamp separate | API sync is not final-day coverage; no site registration attribution |
| `get_kol_performance` | CRM KOL tags + Hologres observed linked accounts | Event snapshot and independent CRM association | Associations can overlap and are not incremental KOL acquisition |
| `get_content_growth` | Manual content ledger + third-party X public post sample | Bounded posts with actual observation cutoff | Accumulated views not week-incremental impressions or X ranking score |
| `get_follower_quality` | Mutable third-party sampled follower/post scan | Scan progress and classification timestamps | Past manual review/status may be unknown, not 0 |
| `get_referral` | Verified binding relationship + observed downstream facts | **Cumulative all-time as-of** by default, even inside a weekly report | Cannot be compared as the week's new referral acquisitions |
| `get_login_conversion` | Login request/terminal observed events | Windowed observed attempts, maturity and separate stages | Event history alone does not prove all login terminal events |
| `get_invite_conversion` | Invite visits/flow events + verified bindings + registration associations | Event window plus separate relationship/registration source | Binding, account existence and newly acquired registration differ |

### Code and transport findings

1. **Misleading conversion coverage fixed.** `conversionSummary()` previously set `coverage.status='verified'` when `history_complete` was true; that only describes one event-history condition and cannot establish complete login/invite terminal and registration/binding associations. It now reports `partial` with a separate `historyComplete` flag. `backend/test/agentTools.test.js` verifies that incomplete registration/binding stays explicitly unavailable.
2. **Association availability was not model-visible.** `modelTransport.statView` had no positive allowlist entry for the aggregated `association` object returned by invite conversion. It now retains only allowlisted `association.available/status/reason` while continuing to drop raw user/binding lists. This lets the AI see missing relationship support instead of assuming that a numeric invite event implies successful verified binding.
3. **Module origin was conflated.** `businessModuleCatalog.sourceType()` previously defaulted every non-SEO built-in tool to the single `logearn_business_observation` label, including CRM manual finance and third-party X scans. It now consumes the audited source types, and `listBusinessModules/executeBusinessModule` expose the concise source-clock/limitation contract for each built-in capability. GSC still distinguishes actual API observation from a manual export when the evidence itself identifies the source; missing GSC origin remains unknown.
4. **No new ingestion or attribution** was created. All 18 mappings refer to existing tool/adapters; CI verifies exact registry parity, source metadata propagation and the invite conversion boundary, but **not** real Hologres/Google/X/CRM availability.

**Audited implementation/test HEAD:** `1f6ca609ac864cb3877208136e8e9c8dae29ddae`. [AI infrastructure run 41199595293](https://github.com/dinnelthai/logearn-growth/actions/runs/41199595293) is the final code/test CI run; check its final conclusion before claiming all jobs passed.

**Remaining independent acceptance:** read-only reconciliation of actual events/registrations/trades, real source freshness and late-arrival coverage for each metric, GSC PT-day completeness, X/KOL retention, invite binding history, operator-confirmed attribution definitions and measured integration latency. These are not proven by the offline catalog audit; the separate Phase 2 independent-watermark/freshness checklist stays open.

## 2026-10-31 — Universal per-metric provenance / freshness envelope

Implementation source/test SHA: `e5a08a39d4668d2895c23bc5997946885292a9a0`. [AI CI run 41200563427](https://github.com/dinnelthai/logearn-growth/actions/runs/41200563427) is the final regression run.

Every **new internal metric evidence** produced through `makeEvidence()` now records a small, immutable `sourceMetadata` alongside its existing formal `definitionVersion`, `filters.scope`, authorized Bangkok `period`, `sourceVersions`, `watermarks`, `coverage` and immutable `queryFingerprint`. Legacy archived evidence is not rewritten; absence of new metadata on historical evidence remains unknown.

| Field | Meaning | Explicit safety boundary |
| --- | --- | --- |
| `sourceMetadata.sourceType` | Audited tool's source type; `query_metrics` additionally distinguishes event-only, registered-account, registration + events, and registration + events + trade metrics | Names components, **not** their availability or causal attribution |
| `sourceMetadata.clock` | Expected source clock: event snapshot, independent registration/trade clocks, GSC PT day, post sample, cumulative referral or manual ledger | Observation clocks are not interchangeable; composite sources do not inherit a single complete-through clock |
| `sourceMetadata.scope` | `all`, `observed_source` or `fixed_audience`, derived from authorized scope plus specific per-channel evidence filters | Does not claim first-touch channel attribution or unlock a wider audience |
| `sourceMetadata.coverageStatus` | Explicit bounded status from existing source coverage, default `unknown` | No inferred `verified` or `empty` status from successful reads |
| `sourceMetadata.freshness.status` | `unknown` when no usable source reference timestamp; `unverified` if a source reference timestamp or reported complete-through exists | **Never** `fresh` or `verified` merely because a query ran |
| `sourceMetadata.freshness.referenceAt` | Actual available source time: event `as_of` for event-only metrics, GSC `syncedAt/importedAt`, X bounded post observation, KOL snapshot timestamp or follower scan update | Import, collection and event snapshot reference times are **not complete-through dates**; composite/CRM-only evidence retains `null` |
| `sourceMetadata.freshness.reportedCompleteThrough` | Only the event source's explicitly reported `events_complete_through` when present and valid | It is **reported**, not live-verified; never synthesized from `as_of`, report `end` or current time |

The positive-allowlist model projection exposes only this compact metadata and no source rows, accounts or identities. `forModelV4` retains the clock/status during bounded compaction; missing source versions and timestamps are projected as `null`, never an empty string that could be mistaken for a data value. `query_metrics` carries `eventsCompleteThrough` only when actually supplied by the snapshot; registration and trade independent watermarks continue to be null unless separately measured.

**Tests:** `backend/test/businessModuleCatalog.test.js` tests every one of the 18 audited tool IDs, plus effective channel-specific source scope. `backend/test/agentTools.test.js` checks mixed account/registration/trade/event metrics, GSC, CRM and model projection. `backend/test/modelEvidenceCompact.test.js` asserts the compact model view keeps unverified source metadata under its byte budget. These are offline contract tests, not source freshness verification.

**Real acceptance still outstanding:** independently read actual Hologres event completeness, account creation watermark, verified transaction enrichment and identity coverage; check stored GSC PT-day completion, X sampling and KOL CRM link completeness; validate operator metric definitions and a real already-authorized v5 report. This implementation explicitly represents unknowns and does not substitute code/CI for real external data acceptance.

## 2026-10-31 — Operating Memory as-of / explicit activity-to-observation joins

**Source/test SHA:** `81bc9a06fba358c484eed9bb620ab303110d8ed5`. [AI CI 41201630015](https://github.com/dinnelthai/logearn-growth/actions/runs/41201630015) passed Contract, Integration and Frontend.

**Two independent records must not be equated just because their dates overlap.** The Operating Memory tool now permits only two strictly labelled and size-limited association classes:

| Association | Required stable key and period condition | Evidence visible to model | Never assert |
| --- | --- | --- | --- |
| `outcomeLinks` | Same-owner CRM **explicit collaboration→activity ID**; collaboration fully contains activity; activity settled before report end; saved result's source-as-of covers activity end but does not exceed report end; per-metric source coverage marked available | Up to 8 hashed collaboration/activity refs, activity window, source-as-of, and bounded observed completed/analysis_users/trade_users/transactions | Collaboration created additional users or caused trades; any source-unavailable outcome is zero |
| `channelLinks` | Same CRM KOL profile ID **and explicit collaboration ref**; KOL observation interval fully contains the collaboration; source watermark covers period and is not future; stored snapshot **capturedAt** independently exists and is <= report end | Up to 8 hashed collaboration refs with window, observed timestamp, available per-KOL aggregates, coverage and `observed-overlap-not-causal` | KOL cohort totals are attributed to this particular collaboration or prove incremental acquisition |

All other apparent similarities (shared channel label, same day, coincidental topic, incomplete observation, missing capture time, unknown linked ID, PT vs Bangkok date mismatch) **remain unlinked**. Explicit links do not resolve overlapping KOL cohorts. Trade volume and verified transactions do not become platform revenue.

The timeline reader also hides **post-report settlements and future settlement snapshots** in historical reports. The positive allowlist transmits only aggregated outcome metrics and opaque `record:[hash]` refs, not raw CRM IDs, members, wallets, posts or user-level records. The link arrays are supplementary associations; original source observations remain separate with their own coverage/freshness.

**Acceptance boundary:** all checks here are source-contract fixtures. Actual production cross-source time alignment, incomplete sampling, historical mutations and causal lift remain independently unverified.

## 2026-10-31 — Owner-scoped measured tool latency and decision cost semantics

The Decision Engine now uses only **successful operation wall-clock observations** from the authorized legacy tool registry. Time is measured monotonically after the tool is authorized, snapshot and budget checks pass. This is an execution observation, **not** the full API request duration, database read bytes, USD charge, provider token cost or guaranteed future service latency. Monetary query cost **always remains unknown** in this contract.

| Dimension | Trust boundary |
| --- | --- |
| Source | `agent_evidence` rows already saved by `createEvidenceStore` under the same authenticated owner; no new collector, paid probe, migration or source of prices |
| Sample eligibility | Valid integer elapsed milliseconds of a successful tool operation, generated in the prior 30 days; same `filters.scope` source/activity/cohort and period duration within 20% of requested period |
| Multiple metrics | One measured sample for a `query_metrics` invocation, not one per returned metric; each legacy single-tool invocation contributes at most one |
| Minimum comparable estimate | Three matching successful records; use median rather than a single optimistic execution; fail closed to unknown if a tool has fewer or incomparable records |
| Ranking | First retain operator priority and goal relevance, then explicitly observed affected users, same-metric user-count change and evidence-backed confidence; historical elapsed milliseconds may distinguish authorized comparable query alternatives |
| Root-cause discriminators | The 2–3 distinct hypotheses and proposed queries must pass the existing strict tool authorization, input schema, source, period and evidence checks **before** measured-latency comparison. No new action is authorized by the ranking. If any candidate timing or tool price gate is unknown, no winner is asserted |
| Model | Ordinary and 13-module weekly v5 contexts contain only a small, sanitized ranking list; strict 22KB budget keeps core KPI evidence first. No raw account/member/user IDs, unrelated private owner details or fabricated query prices |

**Current limitations:** historical elapsed time may be influenced by storage load, parameter cardinality, upstream variance and retries. Same scope/period is a useful comparability guard but not an identical SQL shape guarantee. Not even a complete wall-time sample proves which query yields greater information gain. Hologres physical scan bytes and real financial charge are not collected by this new code. The label `bestObservedLatencyTool` means **lowest measured median among the compared authorized candidates only when all have sample support**; it must never be presented as a verified lowest dollar-cost query.

**Source/test HEAD:** `6540a7a353b5fadb080f016afa2aa2b8795ece0f`; [AI CI 41204481078](https://github.com/dinnelthai/logearn-growth/actions/runs/41204481078) passed Contract, Integration and Frontend. The remaining roadmap items require an **already-authorized real context** check without unapproved paid-model calls and **human** confirmation of product-map / North Star semantics.
