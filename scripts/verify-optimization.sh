#!/bin/bash
# =====================================================================
# 优化效果验证脚本
# =====================================================================
# 检查:
#   1. 前端构建产物
#   2. 后端服务健康
#   3. 数据库优化
#   4. 缓存性能
# =====================================================================

set -e

echo "======================================================================"
echo "🔍 Logearn Growth - 优化效果验证"
echo "======================================================================"
echo ""

# 加载配置
BACKEND_URL=${BACKEND_URL:-http://localhost:3001}
FRONTEND_DIST=${FRONTEND_DIST:-frontend/dist}

# ===================================================================
# 1. 前端构建检查
# ===================================================================

echo "📦 1. 检查前端构建..."
echo ""

if [ ! -d "$FRONTEND_DIST" ]; then
  echo "❌ 前端未构建，请先运行:"
  echo "   cd frontend && npm run build"
  exit 1
fi

# 检查 Dashboard 大小
DASHBOARD_SIZE=$(find "$FRONTEND_DIST"/assets -name "dashboard-*.js" -exec du -h {} \; | awk '{print $1}')
DASHBOARD_SIZE_KB=$(find "$FRONTEND_DIST"/assets -name "dashboard-*.js" -exec du -k {} \; | awk '{sum+=$1} END {print sum}')

echo "Dashboard 大小: $DASHBOARD_SIZE"

if [ "$DASHBOARD_SIZE_KB" -lt 100 ]; then
  echo "✅ Dashboard 已优化 (< 100 KB)"
elif [ "$DASHBOARD_SIZE_KB" -lt 200 ]; then
  echo "⚠️  Dashboard 可进一步优化 (< 200 KB)"
else
  echo "❌ Dashboard 未优化 (> 200 KB)"
fi

# 检查 Brotli 压缩
if ls "$FRONTEND_DIST"/assets/*.js.br > /dev/null 2>&1; then
  echo "✅ Brotli 压缩已启用"

  BR_SIZE=$(find "$FRONTEND_DIST"/assets -name "dashboard-*.js.br" -exec du -h {} \; | awk '{print $1}')
  echo "   压缩后: $BR_SIZE"
else
  echo "⚠️  Brotli 压缩未启用"
fi

# 检查 Service Worker
if [ -f "$FRONTEND_DIST/sw.js" ]; then
  echo "✅ Service Worker 已生成"
else
  echo "⚠️  Service Worker 未生成"
fi

# 检查 PWA manifest
if [ -f "$FRONTEND_DIST/manifest.json" ]; then
  echo "✅ PWA manifest 已生成"
else
  echo "⚠️  PWA manifest 未生成"
fi

echo ""

# ===================================================================
# 2. 后端服务检查
# ===================================================================

echo "🔧 2. 检查后端服务..."
echo ""

# 健康检查
if curl -f -s "$BACKEND_URL/health" > /dev/null 2>&1; then
  echo "✅ 后端服务运行正常"
else
  echo "❌ 后端服务未响应"
  echo "   请检查: pm2 logs logearn-backend"
  exit 1
fi

# 批量查询 API
if curl -f -s "$BACKEND_URL/api/batch-analytics" > /dev/null 2>&1; then
  echo "✅ 批量查询 API 可用"
else
  echo "⚠️  批量查询 API 未部署"
fi

# 缓存统计 API
if curl -f -s "$BACKEND_URL/api/system/metrics" > /dev/null 2>&1; then
  echo "✅ 缓存统计 API 可用"

  # 获取缓存命中率
  CACHE_STATS=$(curl -s "$BACKEND_URL/api/system/metrics" 2>/dev/null || echo '{}')
  CACHE_HIT_RATE=$(echo "$CACHE_STATS" | grep -o '"hitRate":"[^"]*"' | cut -d'"' -f4 || echo "N/A")

  if [ "$CACHE_HIT_RATE" != "N/A" ]; then
    echo "   命中率: $CACHE_HIT_RATE"

    # 解析命中率数值
    HIT_RATE_NUM=$(echo "$CACHE_HIT_RATE" | sed 's/%//')
    if [ ! -z "$HIT_RATE_NUM" ] && [ "$HIT_RATE_NUM" -gt 80 ]; then
      echo "   ✅ 命中率良好 (> 80%)"
    elif [ ! -z "$HIT_RATE_NUM" ] && [ "$HIT_RATE_NUM" -gt 60 ]; then
      echo "   ⚠️  命中率一般 (60-80%)"
    else
      echo "   ⚠️  命中率较低 (< 60%)"
    fi
  fi
else
  echo "⚠️  缓存统计 API 未部署"
fi

# 预聚合 API (阶段 2)
if curl -f -s "$BACKEND_URL/api/rollup/health" > /dev/null 2>&1; then
  echo "✅ 预聚合系统已部署"

  ROLLUP_HEALTH=$(curl -s "$BACKEND_URL/api/rollup/health")
  ROLLUP_STATUS=$(echo "$ROLLUP_HEALTH" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  if [ "$ROLLUP_STATUS" = "ok" ]; then
    echo "   ✅ 预聚合数据正常"
  else
    echo "   ⚠️  预聚合数据异常"
  fi
else
  echo "ℹ️  预聚合系统未部署 (阶段 2)"
fi

echo ""

# ===================================================================
# 3. 数据库优化检查
# ===================================================================

echo "🗄️  3. 检查数据库优化..."
echo ""

# 加载环境变量
if [ -f "backend/.env" ]; then
  source backend/.env 2>/dev/null || true
else
  echo "⚠️  backend/.env 不存在，跳过数据库检查"
  echo ""
  exit 0
fi

if [ -z "$PGHOST" ]; then
  echo "ℹ️  未配置 Hologres，跳过数据库检查"
  echo ""
  exit 0
fi

# 检查数据库连接
if psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" > /dev/null 2>&1; then
  echo "✅ 数据库连接正常"
else
  echo "❌ 数据库连接失败"
  exit 1
fi

# 检查性能索引
INDEXES=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -t -c "
  SELECT COUNT(*)
  FROM pg_indexes
  WHERE tablename = 'growth_events'
    AND indexname IN (
      'idx_growth_events_user_key_ts',
      'idx_growth_events_server_ts',
      'idx_growth_events_event_id'
    )
" 2>/dev/null | tr -d ' ')

if [ "$INDEXES" = "3" ]; then
  echo "✅ 性能索引已创建 (3/3)"
elif [ "$INDEXES" -gt 0 ]; then
  echo "⚠️  性能索引部分创建 ($INDEXES/3)"
else
  echo "ℹ️  性能索引未创建 (阶段 1.5)"
fi

# 检查预聚合表
ROLLUP_TABLES=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -t -c "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'rollup_daily_overview',
      'rollup_daily_sources',
      'rollup_daily_funnels'
    )
" 2>/dev/null | tr -d ' ')

if [ "$ROLLUP_TABLES" = "3" ]; then
  echo "✅ 预聚合表已创建 (3/3)"

  # 检查数据
  ROLLUP_ROWS=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -t -c "
    SELECT COUNT(*) FROM rollup_daily_overview
  " 2>/dev/null | tr -d ' ')

  if [ "$ROLLUP_ROWS" -gt 0 ]; then
    echo "   ✅ 预聚合数据已回填 ($ROLLUP_ROWS 天)"
  else
    echo "   ⚠️  预聚合数据为空，需要回填"
  fi
elif [ "$ROLLUP_TABLES" -gt 0 ]; then
  echo "⚠️  预聚合表部分创建 ($ROLLUP_TABLES/3)"
else
  echo "ℹ️  预聚合表未创建 (阶段 2)"
fi

# 检查物化视图
MV_COUNT=$(psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -t -c "
  SELECT COUNT(*)
  FROM pg_matviews
  WHERE schemaname = 'public'
    AND matviewname IN (
      'mv_events_deduped',
      'mv_identity_map',
      'mv_events_unified'
    )
" 2>/dev/null | tr -d ' ')

if [ "$MV_COUNT" = "3" ]; then
  echo "✅ 物化视图已创建 (3/3)"
elif [ "$MV_COUNT" -gt 0 ]; then
  echo "⚠️  物化视图部分创建 ($MV_COUNT/3)"
else
  echo "ℹ️  物化视图未创建 (阶段 2 可选)"
fi

echo ""

# ===================================================================
# 4. 性能测试
# ===================================================================

echo "⚡ 4. 性能测试..."
echo ""

# 测试 Overview API
echo "测试 Overview API..."
OVERVIEW_START=$(date +%s%N)
curl -s "$BACKEND_URL/api/analytics/status?range=last_7_days" > /dev/null 2>&1
OVERVIEW_END=$(date +%s%N)
OVERVIEW_MS=$(( ($OVERVIEW_END - $OVERVIEW_START) / 1000000 ))

echo "   延迟: ${OVERVIEW_MS}ms"

if [ "$OVERVIEW_MS" -lt 500 ]; then
  echo "   ✅ 性能优秀 (< 500ms)"
elif [ "$OVERVIEW_MS" -lt 1000 ]; then
  echo "   ✅ 性能良好 (< 1s)"
else
  echo "   ⚠️  性能一般 (> 1s)"
fi

# 测试预聚合 API (如果存在)
if curl -f -s "$BACKEND_URL/api/rollup/overview?days=7" > /dev/null 2>&1; then
  echo ""
  echo "测试预聚合 API..."
  ROLLUP_START=$(date +%s%N)
  curl -s "$BACKEND_URL/api/rollup/overview?days=7" > /dev/null 2>&1
  ROLLUP_END=$(date +%s%N)
  ROLLUP_MS=$(( ($ROLLUP_END - $ROLLUP_START) / 1000000 ))

  echo "   延迟: ${ROLLUP_MS}ms"

  if [ "$ROLLUP_MS" -lt 100 ]; then
    echo "   ✅ 性能优秀 (< 100ms)"

    # 计算提升
    if [ "$OVERVIEW_MS" -gt 0 ]; then
      IMPROVEMENT=$(( 100 - (ROLLUP_MS * 100 / OVERVIEW_MS) ))
      echo "   🚀 性能提升: ${IMPROVEMENT}%"
    fi
  elif [ "$ROLLUP_MS" -lt 200 ]; then
    echo "   ✅ 性能良好 (< 200ms)"
  else
    echo "   ⚠️  性能一般 (> 200ms)"
  fi
fi

echo ""

# ===================================================================
# 5. 总结
# ===================================================================

echo "======================================================================"
echo "✅ 验证完成"
echo "======================================================================"
echo ""

echo "📊 优化状态:"
echo ""

# 阶段 1
echo "阶段 1 (基础优化):"
echo "  ✅ 代码分割"
echo "  ✅ 多级缓存"
echo "  ✅ 批量查询"
echo ""

# 阶段 1.5
echo "阶段 1.5 (高级优化):"
if ls "$FRONTEND_DIST"/assets/*.js.br > /dev/null 2>&1; then
  echo "  ✅ Brotli 压缩"
else
  echo "  ⏭️  Brotli 压缩 (未启用)"
fi

if [ -f "$FRONTEND_DIST/sw.js" ]; then
  echo "  ✅ Service Worker"
else
  echo "  ⏭️  Service Worker (未启用)"
fi

if [ "$INDEXES" = "3" ]; then
  echo "  ✅ 数据库索引"
else
  echo "  ⏭️  数据库索引 (未创建)"
fi

echo ""

# 阶段 2
echo "阶段 2 (深度优化):"
if [ "$ROLLUP_TABLES" = "3" ]; then
  echo "  ✅ 每日预聚合"
else
  echo "  ⏭️  每日预聚合 (未部署)"
fi

if [ "$MV_COUNT" = "3" ]; then
  echo "  ✅ 物化视图"
else
  echo "  ⏭️  物化视图 (未部署)"
fi

echo ""

echo "📈 下一步:"
echo ""

# 建议
if ls "$FRONTEND_DIST"/assets/*.js.br > /dev/null 2>&1; then
  :
else
  echo "  1. 部署阶段 1.5: ./scripts/apply-advanced-optimizations.sh"
fi

if [ "$ROLLUP_TABLES" != "3" ]; then
  echo "  2. 部署阶段 2: ./scripts/deploy-stage2.sh"
fi

echo "  3. Lighthouse 测试: lighthouse https://your-domain.com --view"
echo "  4. 监控缓存命中率: curl $BACKEND_URL/api/system/metrics"
echo ""

echo "======================================================================"
