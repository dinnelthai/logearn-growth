-- Hologres 物化视图优化方案
-- 目标: 将复杂的 eventsCte() CTE 预计算为物化视图,查询加速 10 倍
--
-- 执行方式:
-- 1. 手动在 Hologres 控制台执行 (需要 CREATE MATERIALIZED VIEW 权限)
-- 2. 或通过 node src/db/createHologresViews.js 脚本执行
--
-- 刷新策略: Cron 每小时 :05 分执行 REFRESH MATERIALIZED VIEW
--
-- ⚠️ 注意事项:
-- - 物化视图会占用存储空间 (约原表 30-50%)
-- - 首次创建可能需要 10-30 分钟 (取决于数据量)
-- - 刷新期间视图数据可能不一致 (通常 < 5 分钟)

-- ============================================================================
-- 1. 去重事件视图
-- ============================================================================
-- 功能: 按 event_id 去重,保留最早的 server_ts 记录
-- 刷新频率: 每小时
-- 预期大小: 约原表 80% (去除重复事件)

DROP MATERIALIZED VIEW IF EXISTS mv_events_deduped CASCADE;

CREATE MATERIALIZED VIEW mv_events_deduped AS
SELECT DISTINCT ON (event_id)
  id,
  event_id,
  event_name,
  user_id,
  anonymous_id,
  client_ts,
  server_ts,
  properties,
  first_entry_source,
  -- 预计算常用字段
  NULLIF(BTRIM(user_id), '') AS user_id_clean,
  NULLIF(BTRIM(anonymous_id), '') AS anonymous_id_clean
FROM growth_events
WHERE event_id IS NOT NULL
  AND BTRIM(event_id) <> ''
  AND client_ts IS NOT NULL
ORDER BY event_id, server_ts, id;

-- 索引优化
CREATE INDEX idx_mv_events_user
  ON mv_events_deduped(user_id_clean)
  WHERE user_id_clean IS NOT NULL;

CREATE INDEX idx_mv_events_anon
  ON mv_events_deduped(anonymous_id_clean)
  WHERE anonymous_id_clean IS NOT NULL;

CREATE INDEX idx_mv_events_ts
  ON mv_events_deduped(client_ts);

CREATE INDEX idx_mv_events_server_ts
  ON mv_events_deduped(server_ts);

CREATE INDEX idx_mv_events_name
  ON mv_events_deduped(event_name);

CREATE INDEX idx_mv_events_source
  ON mv_events_deduped(first_entry_source)
  WHERE first_entry_source IS NOT NULL;

COMMENT ON MATERIALIZED VIEW mv_events_deduped IS
  '去重事件视图 - 按 event_id 去重,保留最早记录';

-- ============================================================================
-- 2. 身份映射视图
-- ============================================================================
-- 功能: anonymous_id → user_id 单向映射 (仅包含唯一映射)
-- 刷新频率: 每小时
-- 预期大小: 约 10-20% 用户数

DROP MATERIALIZED VIEW IF EXISTS mv_identity_map CASCADE;

CREATE MATERIALIZED VIEW mv_identity_map AS
SELECT
  anonymous_id_clean AS anonymous_id,
  MIN(user_id_clean) AS linked_user
FROM mv_events_deduped
WHERE user_id_clean IS NOT NULL
  AND anonymous_id_clean IS NOT NULL
GROUP BY anonymous_id_clean
HAVING COUNT(DISTINCT user_id_clean) = 1;  -- 仅保留唯一映射

CREATE UNIQUE INDEX idx_mv_identity
  ON mv_identity_map(anonymous_id);

CREATE INDEX idx_mv_identity_user
  ON mv_identity_map(linked_user);

COMMENT ON MATERIALIZED VIEW mv_identity_map IS
  '身份映射视图 - anonymous_id 到 user_id 的唯一映射';

-- ============================================================================
-- 3. 统一身份事件表 (最终查询目标)
-- ============================================================================
-- 功能: 合并身份映射,生成统一的 user_key,排除测试账号
-- 刷新频率: 每小时
-- 预期大小: 约原表 70% (排除测试账号后)

DROP MATERIALIZED VIEW IF EXISTS mv_events_unified CASCADE;

CREATE MATERIALIZED VIEW mv_events_unified AS
WITH enriched AS (
  SELECT
    e.*,
    i.linked_user,
    -- 统一身份 key
    CASE
      WHEN e.user_id_clean IS NOT NULL THEN 'user:' || e.user_id_clean
      WHEN i.linked_user IS NOT NULL THEN 'user:' || i.linked_user
      ELSE 'anonymous:' || e.anonymous_id_clean
    END AS user_key,
    -- 预计算业务日 (UTC+7)
    TO_CHAR(
      TO_TIMESTAMP(e.client_ts / 1000.0) AT TIME ZONE 'Asia/Bangkok',
      'YYYY-MM-DD'
    ) AS date,
    -- 标记是否为测试账号
    LEFT(BTRIM(COALESCE(e.user_id_clean, i.linked_user, '')), 4) = 'acc_' AS is_test_account
  FROM mv_events_deduped e
  LEFT JOIN mv_identity_map i
    ON i.anonymous_id = e.anonymous_id_clean
  WHERE (e.user_id_clean IS NOT NULL OR e.anonymous_id_clean IS NOT NULL)
)
SELECT
  id,
  event_id,
  event_name,
  user_id,
  anonymous_id,
  client_ts,
  server_ts,
  properties,
  first_entry_source,
  user_key,
  date,
  linked_user,
  is_test_account
FROM enriched
WHERE NOT is_test_account  -- 排除测试账号
  -- 额外排除: 混合测试账号 (匿名 ID 曾关联过 acc_ 账号)
  AND NOT EXISTS (
    SELECT 1
    FROM mv_events_deduped dirty
    WHERE dirty.anonymous_id_clean = enriched.anonymous_id_clean
      AND LEFT(BTRIM(dirty.user_id_clean), 4) = 'acc_'
  );

-- 核心索引
CREATE INDEX idx_mv_unified_user_key
  ON mv_events_unified(user_key);

CREATE INDEX idx_mv_unified_date
  ON mv_events_unified(date);

CREATE INDEX idx_mv_unified_ts
  ON mv_events_unified(client_ts);

CREATE INDEX idx_mv_unified_name
  ON mv_events_unified(event_name);

CREATE INDEX idx_mv_unified_source
  ON mv_events_unified(first_entry_source)
  WHERE first_entry_source IS NOT NULL;

-- 组合索引 (常用查询模式)
CREATE INDEX idx_mv_unified_date_source
  ON mv_events_unified(date, first_entry_source)
  WHERE first_entry_source IS NOT NULL;

CREATE INDEX idx_mv_unified_name_date
  ON mv_events_unified(event_name, date);

CREATE INDEX idx_mv_unified_user_ts
  ON mv_events_unified(user_key, client_ts);

COMMENT ON MATERIALIZED VIEW mv_events_unified IS
  '统一身份事件表 - 最终查询目标,已排除测试账号';

-- ============================================================================
-- 4. 统计信息收集 (优化查询计划)
-- ============================================================================

ANALYZE mv_events_deduped;
ANALYZE mv_identity_map;
ANALYZE mv_events_unified;

-- ============================================================================
-- 验证脚本
-- ============================================================================

-- 检查视图行数
SELECT
  'mv_events_deduped' AS view_name,
  COUNT(*) AS row_count,
  MIN(client_ts) AS min_ts,
  MAX(client_ts) AS max_ts
FROM mv_events_deduped
UNION ALL
SELECT
  'mv_identity_map',
  COUNT(*),
  NULL,
  NULL
FROM mv_identity_map
UNION ALL
SELECT
  'mv_events_unified',
  COUNT(*),
  MIN(client_ts),
  MAX(client_ts)
FROM mv_events_unified;

-- 检查身份映射覆盖率
SELECT
  COUNT(DISTINCT anonymous_id) AS total_anonymous,
  COUNT(DISTINCT CASE WHEN linked_user IS NOT NULL THEN anonymous_id END) AS mapped_anonymous,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN linked_user IS NOT NULL THEN anonymous_id END)
    / NULLIF(COUNT(DISTINCT anonymous_id), 0),
    2
  ) AS mapping_rate_pct
FROM mv_events_unified;

-- 检查测试账号过滤效果
SELECT
  'Original' AS dataset,
  COUNT(*) AS event_count,
  COUNT(DISTINCT NULLIF(BTRIM(user_id), '')) AS user_count
FROM growth_events
WHERE client_ts > NOW() - INTERVAL '7 days'
UNION ALL
SELECT
  'After dedup & filter',
  COUNT(*),
  COUNT(DISTINCT CASE WHEN user_key LIKE 'user:%' THEN user_key END)
FROM mv_events_unified
WHERE client_ts > EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000;

-- ============================================================================
-- 刷新命令 (由定时任务调用)
-- ============================================================================

-- 方式 1: 全量刷新 (每小时执行)
-- REFRESH MATERIALIZED VIEW mv_events_deduped;
-- REFRESH MATERIALIZED VIEW mv_identity_map;
-- REFRESH MATERIALIZED VIEW mv_events_unified;

-- 方式 2: 并发刷新 (如果 Hologres 支持)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_events_deduped;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_identity_map;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_events_unified;

-- ============================================================================
-- 性能对比测试
-- ============================================================================

-- 测试 1: 复杂 CTE vs 物化视图 (统计用户数)
-- 原方式 (CTE):
-- EXPLAIN ANALYZE
-- WITH r AS (
--   SELECT *, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY server_ts, id) AS rn
--   FROM growth_events WHERE server_ts <= NOW()
-- ), e AS (
--   SELECT r.*, CASE ... END AS user_key FROM r WHERE rn = 1
-- )
-- SELECT COUNT(DISTINCT user_key) FROM e;

-- 新方式 (物化视图):
-- EXPLAIN ANALYZE
-- SELECT COUNT(DISTINCT user_key) FROM mv_events_unified;

-- 预期结果: 新方式快 10-50 倍

-- ============================================================================
-- 清理命令 (仅用于回滚)
-- ============================================================================

-- DROP MATERIALIZED VIEW IF EXISTS mv_events_unified CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS mv_identity_map CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS mv_events_deduped CASCADE;
