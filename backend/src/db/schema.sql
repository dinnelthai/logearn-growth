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
  is_deleted  INTEGER NOT NULL DEFAULT 0
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

