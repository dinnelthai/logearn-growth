-- AI 分析系统表 (PostgreSQL)
-- 存储用户主动触发的分析、建议、反馈和复盘记录

-- AI 分析记录 (用户主动触发的分析任务)
CREATE TABLE IF NOT EXISTS ai_analysis_records (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  title             TEXT NOT NULL,
  analysis_type     TEXT NOT NULL CHECK(analysis_type IN ('anomaly', 'optimization', 'retrospective')),

  -- 分析范围
  date_range_start  BIGINT NOT NULL,
  date_range_end    BIGINT NOT NULL,
  business_scope    JSONB NOT NULL DEFAULT '{}',  -- {source, channels, cohorts, etc}
  user_question     TEXT,

  -- 数据快照
  data_snapshot     JSONB NOT NULL,
  filter_conditions JSONB NOT NULL DEFAULT '{}',
  comparison_period JSONB,

  -- 分析结果
  status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  result            JSONB,
  error_message     TEXT,

  -- 模型信息
  model_provider    TEXT,
  model_name        TEXT,
  prompt_version    TEXT,
  cost_usd          DECIMAL(10, 6),

  -- 时间戳
  created_at        BIGINT NOT NULL,
  started_at        BIGINT,
  completed_at      BIGINT
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_owner ON ai_analysis_records(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_status ON ai_analysis_records(status);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_date_range ON ai_analysis_records(date_range_start, date_range_end);

-- AI 建议 (从分析中产生的可操作建议)
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id                TEXT PRIMARY KEY,
  analysis_id       TEXT NOT NULL REFERENCES ai_analysis_records(id) ON DELETE CASCADE,
  owner_id          TEXT NOT NULL,

  -- 建议内容
  business_problem  TEXT NOT NULL,
  data_evidence     JSONB NOT NULL,
  hypothesis        TEXT NOT NULL,
  uncertainties     TEXT[],

  -- 具体行动
  action            TEXT NOT NULL,
  priority          TEXT NOT NULL CHECK(priority IN ('P0', 'P1', 'P2')),
  priority_reason   TEXT NOT NULL,
  applicable_scope  JSONB,

  -- 预期影响
  expected_impact   TEXT,
  impact_basis      TEXT,
  validation_metrics JSONB NOT NULL,
  review_conditions TEXT[],

  -- 用户反馈
  user_status       TEXT NOT NULL DEFAULT 'pending' CHECK(user_status IN (
    'pending',      -- 待处理
    'adopted',      -- 已采纳
    'executing',    -- 执行中
    'executed',     -- 已执行
    'rejected',     -- 已拒绝
    'invalid'       -- 已失效
  )),

  -- 实际行动记录
  rejection_reason  TEXT,
  actual_action     TEXT,
  action_scope      JSONB,
  executed_at       BIGINT,
  executed_by       TEXT,

  -- 时间戳
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suggestions_analysis ON ai_suggestions(analysis_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_owner ON ai_suggestions(owner_id, user_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_priority ON ai_suggestions(priority, user_status);

-- AI 复盘记录 (用户主动触发的建议效果复盘)
CREATE TABLE IF NOT EXISTS ai_retrospectives (
  id                TEXT PRIMARY KEY,
  suggestion_id     TEXT NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,
  owner_id          TEXT NOT NULL,

  -- 复盘数据
  baseline_period   JSONB NOT NULL,
  effect_period     JSONB NOT NULL,
  baseline_data     JSONB NOT NULL,
  effect_data       JSONB NOT NULL,

  -- 分析结果
  metric_changes    JSONB NOT NULL,
  has_improvement   BOOLEAN NOT NULL,
  has_causality     BOOLEAN NOT NULL,

  -- 结论
  conclusion        TEXT NOT NULL,
  confidence        TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low', 'insufficient')),
  confounding_factors TEXT[],
  lessons_learned   TEXT,

  -- 模型信息
  model_provider    TEXT,
  model_name        TEXT,
  cost_usd          DECIMAL(10, 6),

  -- 时间戳
  created_at        BIGINT NOT NULL,
  triggered_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retrospectives_suggestion ON ai_retrospectives(suggestion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrospectives_owner ON ai_retrospectives(owner_id, created_at DESC);

-- AI 成本追踪 (追踪每次模型调用的成本)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                BIGSERIAL PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  operation_type    TEXT NOT NULL CHECK(operation_type IN ('analysis', 'investigation', 'retrospective')),
  operation_id      TEXT NOT NULL,

  -- 模型调用信息
  model_provider    TEXT NOT NULL,
  model_name        TEXT NOT NULL,
  input_tokens      INTEGER NOT NULL,
  output_tokens     INTEGER NOT NULL,
  total_tokens      INTEGER NOT NULL,
  cost_usd          DECIMAL(10, 6) NOT NULL,

  -- 性能信息
  duration_ms       INTEGER NOT NULL,
  from_cache        BOOLEAN NOT NULL DEFAULT false,

  -- 时间戳
  created_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_owner ON ai_usage_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_operation ON ai_usage_logs(operation_type, operation_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON ai_usage_logs(created_at DESC);

-- AI 历史经验索引 (用于下次分析时检索相关历史)
CREATE TABLE IF NOT EXISTS ai_experience_index (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  suggestion_id     TEXT NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,

  -- 用于检索的关键信息
  business_problem  TEXT NOT NULL,
  action_taken      TEXT,
  result_summary    TEXT NOT NULL,
  effectiveness     TEXT NOT NULL CHECK(effectiveness IN ('effective', 'ineffective', 'unknown', 'rejected')),

  -- 适用条件
  applicable_scope  JSONB,
  date_range        JSONB NOT NULL,

  -- 时间戳
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL,

  UNIQUE(suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_experience_owner ON ai_experience_index(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experience_effectiveness ON ai_experience_index(effectiveness);

-- 视图: 最近的分析摘要 (便于前端列表展示)
CREATE OR REPLACE VIEW ai_analysis_summary AS
SELECT
  r.id,
  r.owner_id,
  r.title,
  r.analysis_type,
  r.status,
  r.date_range_start,
  r.date_range_end,
  r.created_at,
  r.completed_at,
  r.cost_usd,
  COUNT(DISTINCT s.id) as suggestion_count,
  COUNT(DISTINCT s.id) FILTER (WHERE s.user_status = 'executed') as executed_count,
  COUNT(ret.id) as retrospective_count
FROM ai_analysis_records r
LEFT JOIN ai_suggestions s ON s.analysis_id = r.id
LEFT JOIN ai_retrospectives ret ON ret.suggestion_id = s.id
GROUP BY r.id;

COMMENT ON TABLE ai_analysis_records IS '用户主动触发的 AI 分析记录，包含分析范围、数据快照和结果';
COMMENT ON TABLE ai_suggestions IS 'AI 分析产生的可操作建议，包含证据、行动、用户反馈和执行记录';
COMMENT ON TABLE ai_retrospectives IS '用户主动触发的建议效果复盘，对比基线和效果数据';
COMMENT ON TABLE ai_usage_logs IS 'AI 模型调用成本追踪，记录每次调用的 token 和费用';
COMMENT ON TABLE ai_experience_index IS 'AI 历史经验索引，用于下次分析时检索相关历史建议和结果';

-- Request keys persist across reloads and prevent repeated enqueueing.
ALTER TABLE ai_analysis_records ADD COLUMN IF NOT EXISTS request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ai_analysis_request_key ON ai_analysis_records(owner_id,request_key);

ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS cost_known BOOLEAN NOT NULL DEFAULT false;

-- Worker execution fencing; idempotent for existing installations.
ALTER TABLE ai_analysis_records ADD COLUMN IF NOT EXISTS execution_token TEXT;
ALTER TABLE ai_analysis_records ADD COLUMN IF NOT EXISTS lease_expires_at BIGINT;
CREATE INDEX IF NOT EXISTS idx_ai_analysis_lease ON ai_analysis_records(status,lease_expires_at);

-- Shared cross-worker paid-call fence, complementary to the detailed SQLite trace.
-- "started" is intentionally ambiguous after process loss and cannot be replayed.
CREATE TABLE IF NOT EXISTS ai_analysis_call_guard (
  analysis_id TEXT NOT NULL REFERENCES ai_analysis_records(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  execution_token TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','received','unknown')),
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  PRIMARY KEY (analysis_id,round)
);
CREATE INDEX IF NOT EXISTS idx_ai_call_guard_owner ON ai_analysis_call_guard(owner_id,analysis_id,status);

-- Cooperative cancellation: requests never erase paid-call evidence.
ALTER TABLE ai_analysis_records ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;

-- Preserve exact JSON.stringify bytes used for the model context fingerprint.
ALTER TABLE ai_analysis_records ADD COLUMN IF NOT EXISTS context_payload TEXT;

-- P1 cross-day Growth monitoring. Does not store or recompute Growth metrics;
-- it journals owner-scoped observations derived from completed daily reports.
CREATE TABLE IF NOT EXISTS ai_growth_alerts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  source TEXT NOT NULL,
  goal TEXT NOT NULL,
  metric TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('decline','increase')),
  priority TEXT NOT NULL CHECK(priority IN ('P0','P1')),
  first_period_end BIGINT NOT NULL,
  last_period_end BIGINT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK(occurrences>0),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
  snooze_until BIGINT,
  reviewed_at BIGINT,
  operator_note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  evidence JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(owner_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_ai_growth_alert_owner ON ai_growth_alerts(owner_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_growth_alert_events (
  id BIGSERIAL PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES ai_growth_alerts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('observed','acknowledged','snoozed','resolved','reopened')),
  details JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_growth_alert_events ON ai_growth_alert_events(owner_id,alert_id,id DESC);

-- Drafts produced by zero-LLM cross-day monitoring. Only an authenticated
-- human approval can dispatch a paid business-analysis job.
CREATE TABLE IF NOT EXISTS ai_growth_investigation_proposals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  alert_id TEXT NOT NULL REFERENCES ai_growth_alerts(id) ON DELETE CASCADE,
  period_end BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','approved','dismissed')),
  analysis_id TEXT REFERENCES ai_analysis_records(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  evidence JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(owner_id,alert_id,period_end)
);
CREATE INDEX IF NOT EXISTS idx_ai_growth_proposals_owner
  ON ai_growth_investigation_proposals(owner_id,status,created_at DESC);

-- Shared operational inbox notices. No external delivery is performed unless
-- the future notification transport is explicitly configured.
CREATE TABLE IF NOT EXISTS ai_growth_notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('alert','proposal')),
  resource_id TEXT NOT NULL,
  period_end BIGINT NOT NULL,
  message TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT,
  UNIQUE(owner_id,kind,resource_id,period_end)
);
CREATE INDEX IF NOT EXISTS idx_ai_growth_notifications_owner
  ON ai_growth_notifications(owner_id,created_at DESC);

-- Conservative paid-call admission for human-approved anomaly investigations.
-- A reservation is never refunded automatically: an ambiguous provider
-- request may already have incurred a charge. Counts calls, NOT USD.
CREATE TABLE IF NOT EXISTS ai_growth_paid_call_allocations (
  analysis_id TEXT NOT NULL REFERENCES ai_analysis_records(id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK(round >= 0),
  owner_id TEXT NOT NULL,
  bangkok_day TEXT NOT NULL,
  reserved_at BIGINT NOT NULL,
  PRIMARY KEY(analysis_id,round)
);
CREATE INDEX IF NOT EXISTS idx_growth_paid_allocations_owner_day
  ON ai_growth_paid_call_allocations(owner_id,bangkok_day);

-- P1 SEO: user-imported, immutable GSC query+page+date snapshots.
-- Import is explicit and owner-scoped. These rows are NOT verified Google
-- API observations until the operator provides their own real export.
CREATE TABLE IF NOT EXISTS ai_growth_seo_imports (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source='gsc-manual-export'),
  coverage TEXT NOT NULL CHECK (coverage='export-limited'),
  row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 500),
  rows JSONB NOT NULL,
  checksum TEXT NOT NULL,
  imported_at BIGINT NOT NULL,
  UNIQUE (owner_id, checksum),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_ai_growth_seo_owner_site
 ON ai_growth_seo_imports(owner_id,site_url,end_date DESC,imported_at DESC);

-- Search Console API property selection and read-only, immutable observations.
-- Credentials are exclusively held by the server; never stored in these tables.
CREATE TABLE IF NOT EXISTS ai_growth_gsc_settings (
  owner_id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_growth_gsc_snapshots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'gsc-api' CHECK(source='gsc-api'),
  data_state TEXT NOT NULL CHECK(data_state='final'),
  property_totals JSONB NOT NULL,
  daily JSONB NOT NULL,
  queries JSONB NOT NULL,
  pages JSONB NOT NULL,
  coverage JSONB NOT NULL,
  fetched_at BIGINT NOT NULL,
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_ai_gsc_snapshots_owner_site_period
  ON ai_growth_gsc_snapshots(owner_id,site_url,start_date,end_date,fetched_at DESC);

-- P1 specialist operating automation (all processors are opt-in).
CREATE TABLE IF NOT EXISTS ai_growth_gsc_sync_jobs (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, site_url TEXT NOT NULL,
 target_date DATE NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
  CHECK(state IN ('pending','running','done','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at BIGINT NOT NULL, lease_until BIGINT,
 last_error TEXT, snapshot_id TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 UNIQUE(owner_id,site_url,target_date)
);
CREATE INDEX IF NOT EXISTS idx_growth_gsc_jobs_due
 ON ai_growth_gsc_sync_jobs(state,next_attempt_at,lease_until);

CREATE TABLE IF NOT EXISTS ai_growth_kol_period_snapshots (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
 start_at BIGINT NOT NULL, end_at BIGINT NOT NULL,
 evidence JSONB NOT NULL, coverage JSONB NOT NULL,
 source_watermark TEXT, captured_at BIGINT NOT NULL,
 UNIQUE(owner_id,start_at,end_at),
 CHECK(end_at>start_at)
);
CREATE INDEX IF NOT EXISTS idx_growth_kol_snapshots
 ON ai_growth_kol_period_snapshots(owner_id,end_at DESC);

CREATE TABLE IF NOT EXISTS ai_growth_specialist_tasks (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('seo','kol')),
 fingerprint TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('P0','P1','P2')),
 title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
  CHECK(status IN ('open','acknowledged','executing','executed','resolved','dismissed')),
 source_end BIGINT NOT NULL,
 first_seen_at BIGINT NOT NULL,last_seen_at BIGINT NOT NULL,
 occurrences INTEGER NOT NULL DEFAULT 1 CHECK(occurrences>0),
 snooze_until BIGINT, version INTEGER NOT NULL DEFAULT 1,
 evidence JSONB NOT NULL, action_note TEXT,review_note TEXT,
 updated_at BIGINT NOT NULL,
 UNIQUE(owner_id,kind,fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_growth_specialist_tasks_owner
 ON ai_growth_specialist_tasks(owner_id,status,priority,last_seen_at DESC);
CREATE TABLE IF NOT EXISTS ai_growth_specialist_task_events (
 id BIGSERIAL PRIMARY KEY,task_id TEXT NOT NULL
  REFERENCES ai_growth_specialist_tasks(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL, event_type TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}',created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_specialist_event_owner
 ON ai_growth_specialist_task_events(owner_id,task_id,id DESC);

-- Durable external notification outbox, separately approved/opt-in.
CREATE TABLE IF NOT EXISTS ai_growth_delivery_outbox (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,channel TEXT NOT NULL
  CHECK(channel IN ('webhook','email')),
 source_kind TEXT NOT NULL,source_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending'
  CHECK(state IN ('pending','sending','delivered','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at BIGINT NOT NULL,locked_until BIGINT,
 delivered_at BIGINT,last_http_status INTEGER,last_error TEXT,
 payload JSONB NOT NULL,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 UNIQUE(owner_id,channel,source_kind,source_id)
);
CREATE INDEX IF NOT EXISTS idx_growth_delivery_due
 ON ai_growth_delivery_outbox(state,next_attempt_at,locked_until);

-- Human-entered randomized A/B test inputs, never inferred from analytics
-- channel correlations. No claim of causality without assigned experiment.
CREATE TABLE IF NOT EXISTS ai_growth_experiment_evaluations (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,experiment_key TEXT NOT NULL,
 hypothesis TEXT NOT NULL, primary_metric TEXT NOT NULL,
 started_at BIGINT NOT NULL,ended_at BIGINT NOT NULL,
 design JSONB NOT NULL,result JSONB NOT NULL,
 created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 UNIQUE(owner_id,experiment_key)
);
CREATE INDEX IF NOT EXISTS idx_growth_experiment_owner
 ON ai_growth_experiment_evaluations(owner_id,created_at DESC);

-- P1 autonomous Growth management: operator-owned targets, immutable daily
-- scorecards, evidence-derived strategy versions and judgement calibration.
CREATE TABLE IF NOT EXISTS ai_growth_agent_targets (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,metric TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'all',goal TEXT NOT NULL,
 target NUMERIC NOT NULL CHECK(target>0),
 weight INTEGER NOT NULL DEFAULT 1 CHECK(weight BETWEEN 1 AND 10),
 version INTEGER NOT NULL DEFAULT 1,active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,
 UNIQUE(owner_id,goal,source,metric)
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_targets_owner
 ON ai_growth_agent_targets(owner_id,source,goal,active);

CREATE TABLE IF NOT EXISTS ai_growth_agent_briefs (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,day TEXT NOT NULL,
 source TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ready','partial','blocked')),
 score JSONB NOT NULL, report JSONB NOT NULL,
 analysis_ids JSONB NOT NULL,quality JSONB NOT NULL,
 strategy_version INTEGER,generated_at BIGINT NOT NULL,
 UNIQUE(owner_id,day,source)
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_briefs_owner
 ON ai_growth_agent_briefs(owner_id,source,day DESC);

CREATE TABLE IF NOT EXISTS ai_growth_agent_strategy (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,source TEXT NOT NULL,
 goal TEXT NOT NULL,version INTEGER NOT NULL,
 feedback_digest TEXT NOT NULL,policy JSONB NOT NULL,
 evidence JSONB NOT NULL,created_at BIGINT NOT NULL,
 UNIQUE(owner_id,source,goal,version)
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_strategy_owner
 ON ai_growth_agent_strategy(owner_id,source,goal,version DESC);

CREATE TABLE IF NOT EXISTS ai_growth_agent_judgements (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,
 suggestion_id TEXT NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,
 analysis_id TEXT NOT NULL REFERENCES ai_analysis_records(id) ON DELETE CASCADE,
 retrospective_id TEXT NOT NULL REFERENCES ai_retrospectives(id) ON DELETE CASCADE,
 assessment TEXT NOT NULL CHECK(assessment IN ('observed-supported','observed-contradicted','insufficient')),
 metric TEXT, evidence JSONB NOT NULL,checked_at BIGINT NOT NULL,
 UNIQUE(owner_id,suggestion_id,retrospective_id)
);
CREATE INDEX IF NOT EXISTS idx_growth_agent_judgements_owner
 ON ai_growth_agent_judgements(owner_id,checked_at DESC);

-- Internal notifications are read-only summaries, never automatic actions.
ALTER TABLE ai_growth_notifications DROP CONSTRAINT IF EXISTS ai_growth_notifications_kind_check;
ALTER TABLE ai_growth_notifications ADD CONSTRAINT ai_growth_notifications_kind_check
 CHECK(kind IN ('alert','proposal','daily-brief'));

-- Immutable structured model hypothesis, only when a suggestion cites
-- observed evidence. Null means no numeric prediction was issued.
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS forecast JSONB;
