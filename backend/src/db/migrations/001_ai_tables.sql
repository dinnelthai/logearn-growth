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
