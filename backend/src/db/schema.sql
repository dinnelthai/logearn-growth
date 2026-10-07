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
