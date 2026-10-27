-- =====================================================================
-- 性能优化索引 - Hologres
-- =====================================================================
-- 作用: 加速常见查询模式，减少全表扫描
-- 预期效果: 查询时间减少 30-50%
-- 执行时间: 每个索引约 5-15 分钟（取决于数据量）
-- =====================================================================

-- 前置检查: 查看现有索引
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'growth_events';

-- =====================================================================
-- 核心查询索引
-- =====================================================================

-- 1. anonymous_id 索引 (用户身份查询)
-- 使用场景: 用户路径分析、身份统一
CREATE INDEX IF NOT EXISTS idx_events_anonymous_id
ON growth_events(anonymous_id)
WHERE anonymous_id IS NOT NULL;

-- 2. user_id 索引 (已登录用户查询)
-- 使用场景: 用户行为追踪、留存分析
CREATE INDEX IF NOT EXISTS idx_events_user_id
ON growth_events(user_id)
WHERE user_id IS NOT NULL AND TRIM(user_id) != '';

-- 3. server_ts 索引 (时间范围查询)
-- 使用场景: 所有时间范围查询
CREATE INDEX IF NOT EXISTS idx_events_server_ts
ON growth_events(server_ts DESC);

-- 4. event_id 索引 (事件类型查询)
-- 使用场景: 特定事件过滤
CREATE INDEX IF NOT EXISTS idx_events_event_id
ON growth_events(event_id);

-- =====================================================================
-- 复合索引 (多字段组合查询)
-- =====================================================================

-- 5. event_id + server_ts 复合索引
-- 使用场景: 去重查询 (ROW_NUMBER() OVER PARTITION BY event_id ORDER BY server_ts)
CREATE INDEX IF NOT EXISTS idx_events_event_id_server_ts
ON growth_events(event_id, server_ts DESC, id);

-- 6. anonymous_id + server_ts 复合索引
-- 使用场景: 用户行为时间线查询
CREATE INDEX IF NOT EXISTS idx_events_anon_id_server_ts
ON growth_events(anonymous_id, server_ts DESC)
WHERE anonymous_id IS NOT NULL;

-- 7. user_id + server_ts 复合索引
-- 使用场景: 已登录用户行为时间线
CREATE INDEX IF NOT EXISTS idx_events_user_id_server_ts
ON growth_events(user_id, server_ts DESC)
WHERE user_id IS NOT NULL AND TRIM(user_id) != '';

-- =====================================================================
-- 来源分析索引
-- =====================================================================

-- 8. utm_source 索引
-- 使用场景: 来源质量分析、渠道对比
CREATE INDEX IF NOT EXISTS idx_events_utm_source
ON growth_events(utm_source)
WHERE utm_source IS NOT NULL;

-- 9. utm_source + server_ts 复合索引
-- 使用场景: 来源趋势分析
CREATE INDEX IF NOT EXISTS idx_events_utm_source_ts
ON growth_events(utm_source, server_ts DESC)
WHERE utm_source IS NOT NULL;

-- =====================================================================
-- 推荐分析索引
-- =====================================================================

-- 10. referrer_user_id 索引
-- 使用场景: 推荐贡献分析
CREATE INDEX IF NOT EXISTS idx_events_referrer_user_id
ON growth_events(referrer_user_id)
WHERE referrer_user_id IS NOT NULL;

-- =====================================================================
-- 覆盖索引 (包含常用字段，避免回表)
-- =====================================================================

-- 11. 漏斗分析覆盖索引
-- 包含: event_id, anonymous_id, user_id, server_ts
CREATE INDEX IF NOT EXISTS idx_events_funnel_covering
ON growth_events(event_id, server_ts DESC)
INCLUDE (anonymous_id, user_id);

-- =====================================================================
-- 验证索引效果
-- =====================================================================

-- 查看索引大小
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'growth_events'
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- 查看索引使用情况
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan,  -- 索引扫描次数
--   idx_tup_read,  -- 读取的索引元组数
--   idx_tup_fetch  -- 通过索引获取的表行数
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'growth_events'
-- ORDER BY idx_scan DESC;

-- =====================================================================
-- 使用示例: 查看查询计划
-- =====================================================================

-- 示例 1: 检查时间范围查询是否使用索引
-- EXPLAIN ANALYZE
-- SELECT * FROM growth_events
-- WHERE server_ts >= '2024-01-01'::timestamp
--   AND server_ts < '2024-02-01'::timestamp;
--
-- 预期: Index Scan using idx_events_server_ts

-- 示例 2: 检查事件去重查询是否使用索引
-- EXPLAIN ANALYZE
-- SELECT *, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY server_ts DESC)
-- FROM growth_events
-- WHERE server_ts >= '2024-01-01'::timestamp;
--
-- 预期: Index Scan using idx_events_event_id_server_ts

-- =====================================================================
-- 维护建议
-- =====================================================================

-- 1. 每月分析索引使用情况
--    - 删除 idx_scan = 0 的未使用索引
--    - 根据慢查询日志添加新索引

-- 2. 每季度重建索引 (可选)
--    REINDEX INDEX CONCURRENTLY idx_events_server_ts;

-- 3. 监控索引膨胀
--    SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- =====================================================================
-- 注意事项
-- =====================================================================

-- ⚠️ 索引权衡:
--   - 优点: 加速查询 (30-90%)
--   - 缺点:
--     * 占用额外存储空间 (约 20-30% 表大小)
--     * 插入数据略慢 (约 5-10%)
--     * 需要维护成本

-- ⚠️ Hologres 特性:
--   - 支持部分索引 (WHERE 条件)
--   - 支持 INCLUDE 列 (覆盖索引)
--   - 不支持函数索引
--   - 不支持表达式索引

-- ⚠️ 执行建议:
--   - 在低峰期执行 (CREATE INDEX 会锁表)
--   - 使用 CONCURRENTLY 选项 (Hologres 需确认支持)
--   - 逐个创建，观察影响

-- =====================================================================
-- 完成标记
-- =====================================================================
-- 执行后请记录:
-- - 执行日期: ___________
-- - 数据量: ___________
-- - 执行时间: ___________
-- - 空间占用: ___________
-- =====================================================================
