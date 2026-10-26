-- Custom user cohorts for the analytics dashboard.
-- A cohort is a named set of user_ids (e.g. "十一激活活动"), used as an
-- audience filter layered on top of the existing analytics pipeline.

CREATE TABLE IF NOT EXISTS cohorts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  created_by  TEXT,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'static',
  rule_json TEXT
);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  added_at    INTEGER NOT NULL,
  PRIMARY KEY (cohort_id, user_id),
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON cohort_members(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user   ON cohort_members(user_id);

-- Dashboard operator accounts
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Session tokens (simple, stored in DB, 30-day TTL)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Named saved analysis configs (multi-slot, replaces single localStorage slot)
CREATE TABLE IF NOT EXISTS saved_configs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  config     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_configs_user ON saved_configs(user_id);

-- Product analytics events (shape matches frontend/src/api/demo.json)
CREATE TABLE IF NOT EXISTS events (
  event_id             TEXT PRIMARY KEY,
  event_name           TEXT NOT NULL,
  user_id              TEXT,
  anonymous_id         TEXT,
  first_entry_source   TEXT,
  session_entry_source TEXT,
  session_id           TEXT,
  client_ts            INTEGER NOT NULL,
  page                 TEXT,
  referrer             TEXT,
  chain                TEXT,
  app_version          TEXT,
  device               TEXT,
  ua                   TEXT,
  lang                 TEXT,
  properties           TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_client_ts ON events(client_ts);
CREATE INDEX IF NOT EXISTS idx_events_user_id   ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_name      ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_session   ON events(session_id);

-- Coverage / watermark metadata for the events snapshot (from mock meta)
CREATE TABLE IF NOT EXISTS events_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Product users for analytics facts (not the operator users table)
CREATE TABLE IF NOT EXISTS logearn_users (
  user_id                     TEXT PRIMARY KEY,
  created_at                  TEXT,
  telegram_bound              INTEGER,
  email_bound                 INTEGER,
  is_partner                  INTEGER,
  first_source                TEXT,
  preferred_language          TEXT,
  first_analysis_entry_module TEXT,
  first_analysis_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_logearn_users_created ON logearn_users(created_at);
CREATE INDEX IF NOT EXISTS idx_logearn_users_source  ON logearn_users(first_source);

-- Referral tree roots (one row per inviter / tree owner)
CREATE TABLE IF NOT EXISTS referral_trees (
  user_id    TEXT PRIMARY KEY,
  invited_by TEXT,
  invited_at TEXT,
  commission TEXT NOT NULL DEFAULT '{}'
);

-- Flattened invitee edges for L1/L2/L3
CREATE TABLE IF NOT EXISTS referral_invitees (
  inviter_user_id  TEXT NOT NULL,
  invitee_user_id  TEXT NOT NULL,
  level            INTEGER NOT NULL,
  bound_at         TEXT,
  referral_link_id TEXT,
  share_type       TEXT,
  PRIMARY KEY (inviter_user_id, invitee_user_id, level),
  FOREIGN KEY (inviter_user_id) REFERENCES referral_trees(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_invitees_invitee ON referral_invitees(invitee_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_invitees_level   ON referral_invitees(level);

-- Confirmed trade facts
CREATE TABLE IF NOT EXISTS trades (
  trade_id         TEXT PRIMARY KEY,
  user_id          TEXT,
  confirmed_at     TEXT,
  volume_usd       REAL,
  status           TEXT,
  chain            TEXT,
  mock_scenario    TEXT,
  trade_attempt_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_user         ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_confirmed_at ON trades(confirmed_at);

CREATE TABLE IF NOT EXISTS trades_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- AI 使用日志 (成本追踪)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id             SERIAL PRIMARY KEY,
  model          TEXT NOT NULL,
  provider       TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL,
  total_tokens   INTEGER NOT NULL,
  cost           DECIMAL(10, 6) NOT NULL,
  duration       INTEGER NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model);

-- AI 每日发现 (异常检测结果)
CREATE TABLE IF NOT EXISTS ai_findings (
  id               SERIAL PRIMARY KEY,
  date             DATE NOT NULL,
  metric           TEXT NOT NULL,
  change_percent   DECIMAL(10, 2) NOT NULL,
  current_value    DECIMAL(20, 2),
  previous_value   DECIMAL(20, 2),
  anomaly_score    DECIMAL(10, 4),
  status           TEXT NOT NULL DEFAULT 'new',
  evidence         JSONB,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_findings_date ON ai_findings(date);
CREATE INDEX IF NOT EXISTS idx_ai_findings_status ON ai_findings(status);

-- AI 调查记录 (维度拆解)
CREATE TABLE IF NOT EXISTS ai_investigations (
  id               SERIAL PRIMARY KEY,
  finding_id       INTEGER NOT NULL REFERENCES ai_findings(id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  breakdown        JSONB NOT NULL,
  insights         TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_investigations_finding ON ai_investigations(finding_id);

-- AI 建议 (增长建议)
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id               SERIAL PRIMARY KEY,
  finding_id       INTEGER NOT NULL REFERENCES ai_findings(id) ON DELETE CASCADE,
  hypothesis       TEXT NOT NULL,
  action           TEXT NOT NULL,
  priority         TEXT NOT NULL,
  expected_impact  TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  executed_at      TIMESTAMP,
  result           TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_finding ON ai_suggestions(finding_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(status);

-- AI 追踪记录 (效果复查)
CREATE TABLE IF NOT EXISTS ai_tracking (
  id               SERIAL PRIMARY KEY,
  suggestion_id    INTEGER NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,
  check_date       DATE NOT NULL,
  metric_value     DECIMAL(20, 2),
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tracking_suggestion ON ai_tracking(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_ai_tracking_check_date ON ai_tracking(check_date
);

-- ── Scale path (P2-04): first-touch facts + daily rollups ────────────────────
-- user_facts holds all-time firsts so metrics can classify new vs returning
-- without scanning the full events history outside the selected window.
CREATE TABLE IF NOT EXISTS user_facts (
  user_key          TEXT PRIMARY KEY, -- 'user:<id>' or 'anonymous:<id>'
  user_id           TEXT,
  anonymous_id      TEXT,
  first_source      TEXT,
  first_visit_at    INTEGER,
  first_login_at    INTEGER,
  first_chip_at     INTEGER,
  first_channel_id  TEXT,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_facts_user_id ON user_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_facts_first_chip ON user_facts(first_chip_at);
CREATE INDEX IF NOT EXISTS idx_user_facts_source ON user_facts(first_source);

-- Daily north-star buckets (business date = Asia/Bangkok YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS daily_north_star (
  date               TEXT NOT NULL,
  active_users       INTEGER NOT NULL DEFAULT 0,
  new_users          INTEGER NOT NULL DEFAULT 0,
  returning_users    INTEGER NOT NULL DEFAULT 0,
  login_users        INTEGER NOT NULL DEFAULT 0,
  chip_events        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date)
);

-- Optional membership rows for north-star drill-down (date × user)
CREATE TABLE IF NOT EXISTS daily_north_star_users (
  date     TEXT NOT NULL,
  user_key TEXT NOT NULL,
  is_new   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, user_key)
);

CREATE INDEX IF NOT EXISTS idx_daily_ns_users_user ON daily_north_star_users(user_key);

CREATE TABLE IF NOT EXISTS daily_channel_stats (
  date         TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  visits       INTEGER NOT NULL DEFAULT 0,
  logins       INTEGER NOT NULL DEFAULT 0,
  tokens       INTEGER NOT NULL DEFAULT 0,
  chips        INTEGER NOT NULL DEFAULT 0,
  analyses     INTEGER NOT NULL DEFAULT 0,
  strategies   INTEGER NOT NULL DEFAULT 0,
  d7_eligible  INTEGER NOT NULL DEFAULT 0,
  d7_retained  INTEGER NOT NULL DEFAULT 0,
  traders      INTEGER NOT NULL DEFAULT 0,
  volume_usd   REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, channel_id)
);

CREATE TABLE IF NOT EXISTS daily_trade_stats (
  date       TEXT NOT NULL,
  chain      TEXT NOT NULL,
  submitted  INTEGER NOT NULL DEFAULT 0,
  succeeded  INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  pending    INTEGER NOT NULL DEFAULT 0,
  volume_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, chain)
);

-- Composite indexes for period filters + drill (raw events still used for timelines)
CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(event_name, client_ts);
CREATE INDEX IF NOT EXISTS idx_events_user_name_ts ON events(user_id, event_name, client_ts);

-- Per-user feature snapshot for segmentation at scale (rebuilt offline)
CREATE TABLE IF NOT EXISTS user_features (
  user_id           TEXT PRIMARY KEY,
  user_key          TEXT NOT NULL,
  first_source      TEXT,
  first_chip_at     INTEGER,
  last_chip_at      INTEGER,
  chip_days_28      INTEGER NOT NULL DEFAULT 0,
  ai_strategies_28  INTEGER NOT NULL DEFAULT 0,
  ai_strategies_all INTEGER NOT NULL DEFAULT 0,
  used_strategy     INTEGER NOT NULL DEFAULT 0,
  returned_28       INTEGER NOT NULL DEFAULT 0,
  telegram_bound    INTEGER,
  email_bound       INTEGER,
  preferred_language TEXT,
  as_of             INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_features_source ON user_features(first_source);
CREATE INDEX IF NOT EXISTS idx_user_features_segment ON user_features(last_chip_at, chip_days_28);


CREATE TABLE IF NOT EXISTS growth_activities (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
 start_at INTEGER NOT NULL, cutoff_at INTEGER NOT NULL,
 baseline_snapshot TEXT NOT NULL, import_report TEXT NOT NULL,
 goal TEXT NOT NULL DEFAULT 'activation',
 target_metric TEXT,target_value REAL,
 schedule_state TEXT NOT NULL DEFAULT 'active',schedule_version INTEGER NOT NULL DEFAULT 0,
 baseline_frozen_at INTEGER,schedule_error TEXT,schedule_last_attempt_at INTEGER,
 parent_id TEXT,archived_at INTEGER,tag_version INTEGER NOT NULL DEFAULT 0,
 settled_at INTEGER, settled_result TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON growth_activities(owner_id,start_at);
CREATE TABLE IF NOT EXISTS growth_activity_members (
 activity_id TEXT NOT NULL REFERENCES growth_activities(id),user_id TEXT NOT NULL,
 baseline_first_at INTEGER,PRIMARY KEY(activity_id,user_id)
);
CREATE TABLE IF NOT EXISTS growth_activity_planned_members (
 activity_id TEXT NOT NULL REFERENCES growth_activities(id),user_id TEXT NOT NULL,
 PRIMARY KEY(activity_id,user_id)
);
CREATE TABLE IF NOT EXISTS growth_activity_schedule_history (
 id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES growth_activities(id),
 action TEXT NOT NULL,actor_id TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_kols (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
 platform TEXT NOT NULL, profile_url TEXT NOT NULL DEFAULT '',
 account_id TEXT, assignee TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT '待联系',
 contact TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', next_followup_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,account_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_owner ON crm_kols(owner_id,updated_at);
CREATE TABLE IF NOT EXISTS crm_followups (
 id TEXT PRIMARY KEY, kol_id TEXT NOT NULL REFERENCES crm_kols(id),
 author_id TEXT NOT NULL, content TEXT NOT NULL, next_step TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_activity_links (
 kol_id TEXT NOT NULL REFERENCES crm_kols(id),
 activity_id TEXT NOT NULL REFERENCES growth_activities(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(kol_id,activity_id)
);
CREATE TABLE IF NOT EXISTS crm_profile_history (
 id TEXT PRIMARY KEY, kol_id TEXT NOT NULL REFERENCES crm_kols(id),
 author_id TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_kol_members (
 kol_id TEXT NOT NULL REFERENCES crm_kols(id),user_id TEXT NOT NULL,
 PRIMARY KEY(kol_id,user_id)
);

CREATE TABLE IF NOT EXISTS user_followups (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,user_key TEXT NOT NULL,
 content TEXT NOT NULL,next_step TEXT NOT NULL DEFAULT '',due_at INTEGER,
 status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_user_followup_owner ON user_followups(owner_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_user_followup_user ON user_followups(owner_id,user_key,created_at);

CREATE TABLE IF NOT EXISTS growth_activity_tags (
 activity_id TEXT NOT NULL REFERENCES growth_activities(id),user_id TEXT NOT NULL,added_at INTEGER NOT NULL,
 PRIMARY KEY(activity_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_tags_user ON growth_activity_tags(user_id,activity_id);

CREATE TABLE IF NOT EXISTS operation_tasks (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, origin_job TEXT NOT NULL,
 title TEXT NOT NULL,assignee TEXT NOT NULL DEFAULT '',priority TEXT NOT NULL DEFAULT 'P2',
 status TEXT NOT NULL DEFAULT 'open',next_step TEXT NOT NULL DEFAULT '',due_at INTEGER,
 source_json TEXT NOT NULL,members_json TEXT NOT NULL,baseline_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,completed_at INTEGER,
 UNIQUE(owner_id,origin_job)
);
CREATE INDEX IF NOT EXISTS idx_operation_tasks_owner ON operation_tasks(owner_id,status,due_at);
CREATE TABLE IF NOT EXISTS operation_task_history (
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES operation_tasks(id),
 note TEXT NOT NULL DEFAULT '',before_json TEXT,after_json TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operation_task_history ON operation_task_history(task_id,created_at);

CREATE TABLE IF NOT EXISTS crm_collaborations (
 id TEXT PRIMARY KEY,kol_id TEXT NOT NULL REFERENCES crm_kols(id),owner_id TEXT NOT NULL,
 name TEXT NOT NULL,start_at INTEGER NOT NULL,end_at INTEGER NOT NULL,
 goal TEXT NOT NULL DEFAULT '',deliverables TEXT NOT NULL DEFAULT '',assignee TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'planned',review TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collaboration_kol ON crm_collaborations(kol_id,created_at);
CREATE TABLE IF NOT EXISTS crm_collaboration_activities (
 collaboration_id TEXT NOT NULL REFERENCES crm_collaborations(id),activity_id TEXT NOT NULL REFERENCES growth_activities(id),
 created_at INTEGER NOT NULL,PRIMARY KEY(collaboration_id,activity_id)
);
CREATE TABLE IF NOT EXISTS crm_collaboration_costs (
 id TEXT PRIMARY KEY,collaboration_id TEXT NOT NULL REFERENCES crm_collaborations(id),
 category TEXT NOT NULL,currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,
 state TEXT NOT NULL,description TEXT NOT NULL,occurred_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collaboration_costs ON crm_collaboration_costs(collaboration_id,created_at);
CREATE TABLE IF NOT EXISTS crm_collaboration_history (
 id TEXT PRIMARY KEY,collaboration_id TEXT NOT NULL REFERENCES crm_collaborations(id),
 summary TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_collaboration_reports (
 id TEXT PRIMARY KEY,collaboration_id TEXT NOT NULL REFERENCES crm_collaborations(id),
 version INTEGER NOT NULL,report_json TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(collaboration_id,version)
);

CREATE TABLE IF NOT EXISTS operation_comparison_reports (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,
 configuration_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comparison_report_owner ON operation_comparison_reports(owner_id,created_at);

CREATE TABLE IF NOT EXISTS crm_collaboration_revenue (
 id TEXT PRIMARY KEY,collaboration_id TEXT NOT NULL REFERENCES crm_collaborations(id),
 currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,kind TEXT NOT NULL,
 state TEXT NOT NULL,reference TEXT NOT NULL,description TEXT NOT NULL,occurred_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 UNIQUE(collaboration_id,reference)
);
CREATE TABLE IF NOT EXISTS cohort_versions (
 id TEXT PRIMARY KEY,cohort_id TEXT NOT NULL REFERENCES cohorts(id),origin_job TEXT,
 members_json TEXT NOT NULL,context_json TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(cohort_id,origin_job)
);
CREATE INDEX IF NOT EXISTS idx_cohort_versions ON cohort_versions(cohort_id,created_at);
CREATE TABLE IF NOT EXISTS audience_tag_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,tag_id TEXT NOT NULL,
 user_id TEXT NOT NULL,action TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tag_history ON audience_tag_history(owner_id,created_at);
CREATE TRIGGER IF NOT EXISTS audit_activity_tag_add AFTER INSERT ON growth_activity_tags BEGIN
 INSERT INTO audience_tag_history(owner_id,tag_id,user_id,action,created_at) SELECT owner_id,'activity:'||id,NEW.user_id,'add',CAST(unixepoch('subsec')*1000 AS INTEGER) FROM growth_activities WHERE id=NEW.activity_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_activity_tag_remove AFTER DELETE ON growth_activity_tags BEGIN
 INSERT INTO audience_tag_history(owner_id,tag_id,user_id,action,created_at) SELECT owner_id,'activity:'||id,OLD.user_id,'remove',CAST(unixepoch('subsec')*1000 AS INTEGER) FROM growth_activities WHERE id=OLD.activity_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_kol_tag_add AFTER INSERT ON crm_kol_members BEGIN
 INSERT INTO audience_tag_history(owner_id,tag_id,user_id,action,created_at) SELECT owner_id,'kol:'||id,NEW.user_id,'add',CAST(unixepoch('subsec')*1000 AS INTEGER) FROM crm_kols WHERE id=NEW.kol_id;
END;
CREATE TRIGGER IF NOT EXISTS audit_kol_tag_remove AFTER DELETE ON crm_kol_members BEGIN
 INSERT INTO audience_tag_history(owner_id,tag_id,user_id,action,created_at) SELECT owner_id,'kol:'||id,OLD.user_id,'remove',CAST(unixepoch('subsec')*1000 AS INTEGER) FROM crm_kols WHERE id=OLD.kol_id;
END;
CREATE TABLE IF NOT EXISTS promotion_links (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kol_id TEXT REFERENCES crm_kols(id),activity_id TEXT REFERENCES growth_activities(id),
 name TEXT NOT NULL,url TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_owner ON promotion_links(owner_id,created_at);


CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_kol_owner_pair ON crm_kols(id,owner_id);
CREATE TABLE IF NOT EXISTS crm_kol_accounts (
 kol_id TEXT NOT NULL,owner_id TEXT NOT NULL,account_id TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,account_id),UNIQUE(kol_id,account_id),
 FOREIGN KEY(kol_id,owner_id) REFERENCES crm_kols(id,owner_id)
);
CREATE INDEX IF NOT EXISTS idx_kol_accounts_kol ON crm_kol_accounts(kol_id,position);
DROP TRIGGER IF EXISTS audit_kol_account_add;
DROP TRIGGER IF EXISTS audit_kol_account_change;
CREATE TRIGGER IF NOT EXISTS audit_kol_accounts_add AFTER INSERT ON crm_kol_accounts BEGIN
 INSERT INTO audience_tag_history(owner_id,tag_id,user_id,action,created_at) VALUES(NEW.owner_id,'kol:'||NEW.kol_id,NEW.account_id,'account_add',CAST(unixepoch('subsec')*1000 AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS audit_kol_accounts_remove AFTER DELETE ON crm_kol_accounts BEGIN
 INSERT INTO audience_tag_history(owner_id,tag_id,user_id,action,created_at) VALUES(OLD.owner_id,'kol:'||OLD.kol_id,OLD.account_id,'account_remove',CAST(unixepoch('subsec')*1000 AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS legacy_kol_account_insert AFTER INSERT ON crm_kols WHEN NEW.account_id IS NOT NULL BEGIN
 INSERT INTO crm_kol_accounts(kol_id,owner_id,account_id,position,created_at) VALUES(NEW.id,NEW.owner_id,NEW.account_id,0,NEW.created_at);
END;

CREATE TABLE IF NOT EXISTS ops_address_notes (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, user_key TEXT, network TEXT NOT NULL,
 address TEXT NOT NULL, alias TEXT NOT NULL DEFAULT '', note TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,network,address)
);
CREATE TABLE IF NOT EXISTS ops_entitlements (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, user_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('week','month','nft')), starts_at INTEGER NOT NULL, expires_at INTEGER,
 quantity INTEGER NOT NULL DEFAULT 1, reference TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 revoked_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_entitlements_owner ON ops_entitlements(owner_id,user_key,expires_at);
CREATE TABLE IF NOT EXISTS ops_conversion_tasks (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, user_key TEXT NOT NULL, title TEXT NOT NULL,
 goal TEXT NOT NULL, target_days INTEGER NOT NULL DEFAULT 2, entitlement_id TEXT,
 status TEXT NOT NULL DEFAULT 'open', starts_at INTEGER NOT NULL, deadline INTEGER NOT NULL, due_at INTEGER,
 next_step TEXT NOT NULL DEFAULT '', baseline_json TEXT NOT NULL, result_json TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_conversion_owner ON ops_conversion_tasks(owner_id,user_key,status,deadline);
CREATE TABLE IF NOT EXISTS ops_crm_history (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, object_id TEXT NOT NULL, action TEXT NOT NULL,
 before_json TEXT, after_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_crm_history_owner ON ops_crm_history(owner_id,object_id,created_at);
CREATE TABLE IF NOT EXISTS ops_conversion_reports (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,user_key TEXT,report_json TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_conversion_reports_owner ON ops_conversion_reports(owner_id,created_at);

CREATE TABLE IF NOT EXISTS ops_credentials(owner_id TEXT PRIMARY KEY,ciphertext TEXT NOT NULL,iv TEXT NOT NULL,tag TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ops_batches(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,operation TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'prepared',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,started_at INTEGER,finished_at INTEGER);
CREATE INDEX IF NOT EXISTS ops_batches_owner ON ops_batches(owner_id,created_at);
CREATE TABLE IF NOT EXISTS ops_batch_rows(batch_id TEXT NOT NULL,row_no INTEGER NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',result_json TEXT,PRIMARY KEY(batch_id,row_no));

CREATE TABLE IF NOT EXISTS growth_activity_merged_batches (
 child_id TEXT PRIMARY KEY,root_id TEXT NOT NULL,owner_id TEXT NOT NULL,merged_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS growth_analysis_reports (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,
 configuration_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS growth_analysis_reports_owner ON growth_analysis_reports(owner_id,created_at);

-- Append-only activity evidence; does not send messages or alter settled metrics.
CREATE TABLE IF NOT EXISTS growth_activity_evidence_state (
 activity_id TEXT PRIMARY KEY REFERENCES growth_activities(id), version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS growth_activity_assignments (
 activity_id TEXT NOT NULL REFERENCES growth_activities(id), user_id TEXT NOT NULL,
 group_key TEXT NOT NULL CHECK(group_key IN ('treatment','control')),
 assigned_at INTEGER NOT NULL, author_id TEXT NOT NULL,
 activity_start_at INTEGER NOT NULL, activity_cutoff_at INTEGER NOT NULL,
 baseline_first_at INTEGER, PRIMARY KEY(activity_id,user_id)
);
CREATE TABLE IF NOT EXISTS growth_activity_delivery_evidence (
 id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES growth_activities(id), user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('sent','delivered','not_delivered','cross_exposed','note')),
 occurred_at INTEGER NOT NULL, channel TEXT NOT NULL, evidence TEXT NOT NULL,
 recorded_at INTEGER NOT NULL, author_id TEXT NOT NULL, request_id TEXT NOT NULL,
 UNIQUE(activity_id,request_id),
 FOREIGN KEY(activity_id,user_id) REFERENCES growth_activity_assignments(activity_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_delivery_evidence ON growth_activity_delivery_evidence(activity_id,occurred_at,recorded_at);
