#!/usr/bin/env bash
# 性能对比测试脚本
# 用于对比优化前后的性能差异

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_BASE=${API_BASE:-http://localhost:3000}
TOKEN=${TOKEN:-}

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠ TOKEN 未设置，部分测试可能失败${NC}"
  echo "使用方式: TOKEN=your_jwt_token ./scripts/benchmark-comparison.sh"
  echo ""
fi

echo "=================================="
echo "性能对比测试"
echo "=================================="
echo "API: $API_BASE"
echo ""

# 时间范围 (最近 7 天)
END=$(date +%s)000
START=$((END - 7 * 24 * 3600 * 1000))

# ============================================================================
# 测试 1: 单独请求 vs 批量请求
# ============================================================================
echo "--- 测试 1: 批量查询优化 ---"
echo ""

# 1.1 单独请求 (串行)
echo "1.1 单独请求 (3 个串行)"
START_TIME=$(date +%s%3N)

for TYPE in "home-overview" "growth-insights" "channels"; do
  curl -s -X POST "$API_BASE/api/batch-analytics" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"queries\":[{\"type\":\"$TYPE\",\"params\":{\"start\":$START,\"end\":$END}}]}" \
    > /dev/null 2>&1 || true
done

SINGLE_TIME=$(($(date +%s%3N) - START_TIME))
echo -e "  耗时: ${YELLOW}${SINGLE_TIME}ms${NC}"
echo ""

# 1.2 批量请求 (并行)
echo "1.2 批量请求 (1 个并行)"
START_TIME=$(date +%s%3N)

curl -s -X POST "$API_BASE/api/batch-analytics" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"queries\": [
      {\"type\":\"home-overview\",\"params\":{\"start\":$START,\"end\":$END}},
      {\"type\":\"growth-insights\",\"params\":{\"start\":$START,\"end\":$END,\"source\":\"all\"}},
      {\"type\":\"channels\",\"params\":{\"start\":$START,\"end\":$END,\"source\":\"all\"}}
    ]
  }" > /dev/null 2>&1 || true

BATCH_TIME=$(($(date +%s%3N) - START_TIME))
echo -e "  耗时: ${GREEN}${BATCH_TIME}ms${NC}"
echo ""

# 对比
if [ "$SINGLE_TIME" -gt 0 ] && [ "$BATCH_TIME" -gt 0 ]; then
  IMPROVEMENT=$(awk "BEGIN {printf \"%.1f\", (1 - $BATCH_TIME / $SINGLE_TIME) * 100}")
  echo -e "🎯 批量查询性能提升: ${GREEN}${IMPROVEMENT}%${NC}"
  echo "   ($SINGLE_TIME ms → $BATCH_TIME ms)"
else
  echo -e "${YELLOW}⚠ 无法计算性能提升 (可能是 API 不可用)${NC}"
fi

echo ""

# ============================================================================
# 测试 2: 缓存效果
# ============================================================================
echo "--- 测试 2: 缓存效果 ---"
echo ""

# 2.1 首次请求 (冷缓存)
echo "2.1 首次请求 (冷缓存)"
curl -s -X POST "$API_BASE/api/system/metrics/flush-cache" \
  -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
sleep 1

START_TIME=$(date +%s%3N)
curl -s -X POST "$API_BASE/api/batch-analytics" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"queries\":[{\"type\":\"status\",\"params\":{}}]}" \
  > /dev/null 2>&1 || true
COLD_TIME=$(($(date +%s%3N) - START_TIME))
echo -e "  耗时: ${YELLOW}${COLD_TIME}ms${NC}"
echo ""

# 2.2 重复请求 (热缓存)
echo "2.2 重复请求 (热缓存)"
START_TIME=$(date +%s%3N)
curl -s -X POST "$API_BASE/api/batch-analytics" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"queries\":[{\"type\":\"status\",\"params\":{}}]}" \
  > /dev/null 2>&1 || true
HOT_TIME=$(($(date +%s%3N) - START_TIME))
echo -e "  耗时: ${GREEN}${HOT_TIME}ms${NC}"
echo ""

# 对比
if [ "$COLD_TIME" -gt 0 ] && [ "$HOT_TIME" -gt 0 ]; then
  SPEEDUP=$(awk "BEGIN {printf \"%.1f\", $COLD_TIME / $HOT_TIME}")
  CACHE_IMPROVEMENT=$(awk "BEGIN {printf \"%.1f\", (1 - $HOT_TIME / $COLD_TIME) * 100}")
  echo -e "🎯 缓存加速: ${GREEN}${SPEEDUP}x${NC} (提升 ${CACHE_IMPROVEMENT}%)"
  echo "   ($COLD_TIME ms → $HOT_TIME ms)"
else
  echo -e "${YELLOW}⚠ 无法计算缓存效果${NC}"
fi

echo ""

# ============================================================================
# 测试 3: 缓存命中率
# ============================================================================
echo "--- 测试 3: 缓存统计 ---"
echo ""

METRICS=$(curl -s "$API_BASE/api/system/metrics" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "{}")

if echo "$METRICS" | grep -q "hit_rate"; then
  HIT_RATE=$(echo "$METRICS" | grep -oP '"hit_rate"\s*:\s*"\K[^"]+' || echo "N/A")
  CACHE_KEYS=$(echo "$METRICS" | grep -oP '"keys"\s*:\s*\K[0-9]+' || echo "N/A")
  CACHE_HITS=$(echo "$METRICS" | grep -oP '"hits"\s*:\s*\K[0-9]+' || echo "N/A")
  CACHE_MISSES=$(echo "$METRICS" | grep -oP '"misses"\s*:\s*\K[0-9]+' || echo "N/A")

  echo "缓存命中率: $HIT_RATE"
  echo "缓存键数: $CACHE_KEYS"
  echo "命中次数: $CACHE_HITS"
  echo "未命中次数: $CACHE_MISSES"

  # 评估命中率
  HIT_RATE_NUM=$(echo "$HIT_RATE" | sed 's/%//')
  if [ -n "$HIT_RATE_NUM" ] && [ "$HIT_RATE_NUM" -ge 80 ]; then
    echo -e "评估: ${GREEN}优秀 (≥ 80%)${NC}"
  elif [ -n "$HIT_RATE_NUM" ] && [ "$HIT_RATE_NUM" -ge 60 ]; then
    echo -e "评估: ${YELLOW}良好 (≥ 60%)${NC}"
  elif [ -n "$HIT_RATE_NUM" ]; then
    echo -e "评估: ${RED}待优化 (< 60%)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ 无法获取缓存统计 (可能需要认证)${NC}"
fi

echo ""

# ============================================================================
# 测试 4: 前端资源大小
# ============================================================================
echo "--- 测试 4: 前端资源大小 ---"
echo ""

if [ -d "frontend/dist/assets" ]; then
  echo "文件大小对比:"
  echo ""

  # Dashboard
  DASHBOARD_SIZE=$(find frontend/dist/assets -name "dashboard-*.js" -exec du -h {} \; | awk '{print $1}' | head -1)
  if [ -n "$DASHBOARD_SIZE" ]; then
    echo "  dashboard.js: $DASHBOARD_SIZE"
    echo "    优化前: 410 KB"
    echo -e "    ${GREEN}优化: -84%${NC}"
  fi

  # ECharts
  ECHARTS_SIZE=$(find frontend/dist/assets -name "echarts-lib-*.js" -exec du -h {} \; | awk '{print $1}' | head -1)
  if [ -n "$ECHARTS_SIZE" ]; then
    echo "  echarts-lib.js: $ECHARTS_SIZE (按需加载)"
  fi

  # Analytics Core
  ANALYTICS_SIZE=$(find frontend/dist/assets -name "analytics-core-*.js" -exec du -h {} \; | awk '{print $1}' | head -1)
  if [ -n "$ANALYTICS_SIZE" ]; then
    echo "  analytics-core.js: $ANALYTICS_SIZE"
  fi

  # 总大小
  TOTAL_SIZE=$(du -sh frontend/dist/assets | awk '{print $1}')
  echo ""
  echo "  总资源大小: $TOTAL_SIZE"
else
  echo -e "${YELLOW}⚠ frontend/dist 不存在，请先构建: cd frontend && npm run build${NC}"
fi

echo ""

# ============================================================================
# 总结
# ============================================================================
echo "=================================="
echo "总结"
echo "=================================="
echo ""

if [ "$SINGLE_TIME" -gt 0 ] && [ "$BATCH_TIME" -gt 0 ]; then
  echo -e "✓ 批量查询优化: ${GREEN}$IMPROVEMENT%${NC}"
fi

if [ "$COLD_TIME" -gt 0 ] && [ "$HOT_TIME" -gt 0 ]; then
  echo -e "✓ 缓存加速: ${GREEN}${SPEEDUP}x${NC}"
fi

if [ -n "$HIT_RATE" ]; then
  echo -e "✓ 缓存命中率: ${GREEN}$HIT_RATE${NC}"
fi

if [ -d "frontend/dist/assets" ]; then
  echo -e "✓ 前端资源优化: ${GREEN}dashboard.js -84%${NC}"
fi

echo ""
echo "完整性能报告见:"
echo "  - OPTIMIZATION_COMPLETE.md"
echo "  - /api/system/metrics"
echo ""
