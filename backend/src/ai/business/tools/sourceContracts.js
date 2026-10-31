'use strict';
// Audited source contracts for every built-in read-only Growth investigation.
// A clock describes the available observation basis, NOT source completeness.
// Do not treat independent CRMs, PT-day Search Console, external X snapshots
// or confirmed transaction enrichment as one interchangeable event watermark.
const definitions={
 query_metrics:['mixed_registered_events_trades','per_metric','Registration, events and trades have distinct availability and maturity'],
 get_funnel:['hologres_observed_events','event_snapshot','Observed ordered visits; unlinked or immature steps are unknown'],
 get_paths:['hologres_observed_events','event_snapshot','Observed event paths, not a complete user journey'],
 get_product_chain:['hologres_events_and_verified_trades','event_and_trade','Successful same-token analysis and identity-linked trades have separate coverage'],
 get_retention:['hologres_observed_events','mature_business_day','Only complete mature cohorts; historical ingestion may be incomplete'],
 get_channels:['hologres_observed_source','event_snapshot','First observed source is not verified acquisition or causal attribution'],
 get_segments:['hologres_observed_cohorts','event_snapshot','Fixed observed cohort may overlap; no incremental causal meaning'],
 get_activity:['crm_fixed_audience_and_hologres','activity_window_and_event','Fixed activity memberships are not a source-level attribution claim'],
 get_operations_timeline:['crm_x_gsc_ai_mixed','independent_source_clocks','Human records and channel observations have no common completeness watermark'],
 get_channel_economics:['crm_manual_collaboration_ledger','manual_records','Manual costs/receipts by currency, not platform revenue'],
 check_data_quality:['hologres_event_diagnostics','event_snapshot','History and diagnostic family coverage must be checked separately'],
 get_seo_performance:['search_source_unknown','pt_calendar_snapshot','API sync or manual import; collection time is not full PT-day coverage'],
 get_kol_performance:['crm_tagged_hologres_observation','event_snapshot_plus_crm','CRM association may overlap and is not incremental KOL acquisition'],
 get_content_growth:['manual_content_and_x_public_sample','bounded_post_observation','Cumulative public post observations are not weekly incremental reach'],
 get_follower_quality:['x_mutable_follower_sample','mutable_scan_progress','Post-classification and manual review history may be incomplete'],
 get_referral:['verified_referral_bindings_cumulative','cumulative_asof','Default report is all-time referral relations, not selected reporting period'],
 get_login_conversion:['hologres_login_events','observed_event_window','History completeness alone does not verify login terminal states'],
 get_invite_conversion:['events_referral_bindings_registration','event_and_relationship','Invitation visits, verified bindings and registration are distinct facts']
};
const SOURCE_CONTRACTS=Object.freeze(Object.fromEntries(
 Object.entries(definitions).map(([id,[sourceType,clock,limitation]])=>
  [id,Object.freeze({sourceType,clock,limitation})])
));
module.exports={SOURCE_CONTRACTS};
