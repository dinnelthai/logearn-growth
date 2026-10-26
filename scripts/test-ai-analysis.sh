#!/bin/bash
#
# AI 分析功能测试脚本
#

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"

echo "🔍 AI 分析功能测试"
echo "==================="
echo

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local auth_header=${5:-""}

  echo -n "测试: $name ... "

  if [ -n "$auth_header" ]; then
    if [ "$method" = "GET" ]; then
      response=$(curl -s -w "\n%{http_code}" -X GET \
        -H "Authorization: Bearer $auth_header" \
        -H "Content-Type: application/json" \
        "$BACKEND_URL$endpoint")
    else
      response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer $auth_header" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$BACKEND_URL$endpoint")
    fi
  else
    if [ "$method" = "GET" ]; then
      response=$(curl -s -w "\n%{http_code}" -X GET \
        -H "Content-Type: application/json" \
        "$BACKEND_URL$endpoint")
    else
      response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$BACKEND_URL$endpoint")
    fi
  fi

  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | head -n -1)

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo -e "${GREEN}✓${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    return 0
  else
    echo -e "${RED}✗ (HTTP $http_code)${NC}"
    echo "$body"
    return 1
  fi
}

# 1. 测试健康检查
echo "1️⃣  后端健康检查"
test_endpoint "健康检查" "GET" "/health"
echo

# 2. 登录获取 token（如果需要）
echo "2️⃣  用户登录"
read -p "输入用户名（默认: admin）: " username
username=${username:-admin}

read -sp "输入密码（默认: admin123）: " password
password=${password:-admin123}
echo

LOGIN_DATA="{\"username\":\"$username\",\"password\":\"$password\"}"
login_response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$LOGIN_DATA" \
  "$BACKEND_URL/api/auth/login")

TOKEN=$(echo "$login_response" | jq -r '.token' 2>/dev/null)

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ 登录失败${NC}"
  echo "$login_response"
  exit 1
fi

echo -e "${GREEN}✓ 登录成功${NC}"
echo "Token: ${TOKEN:0:20}..."
echo

# 3. 测试队列统计
echo "3️⃣  队列统计"
test_endpoint "获取队列统计" "GET" "/api/queue/stats/ai-analysis" "" "$TOKEN"
echo

# 4. 测试今日使用统计
echo "4️⃣  AI 使用统计"
test_endpoint "今日使用统计" "GET" "/api/ai/usage/today" "" "$TOKEN"
echo

# 5. 测试可用模型
echo "5️⃣  可用模型列表"
test_endpoint "获取可用模型" "GET" "/api/ai/models" "" "$TOKEN"
echo

# 6. 创建异常检测任务
echo "6️⃣  创建异常检测任务"
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)

ANOMALY_DATA=$(cat <<EOF
{
  "type": "anomaly-detection",
  "data": {
    "date": "$YESTERDAY",
    "metrics": ["active_users", "new_users", "returning_users"],
    "threshold": 15,
    "source": "all"
  },
  "priority": 1
}
EOF
)

if test_endpoint "创建异常检测任务" "POST" "/api/queue/ai-analysis" "$ANOMALY_DATA" "$TOKEN"; then
  echo -e "${GREEN}✓ 异常检测任务已创建${NC}"

  # 提取 jobId
  JOB_ID=$(echo "$body" | jq -r '.jobId' 2>/dev/null)

  if [ "$JOB_ID" != "null" ] && [ -n "$JOB_ID" ]; then
    echo "Job ID: $JOB_ID"

    # 等待一会儿
    echo -n "等待任务执行"
    for i in {1..5}; do
      sleep 2
      echo -n "."
    done
    echo

    # 查询任务状态
    echo "7️⃣  查询任务状态"
    test_endpoint "获取任务状态" "GET" "/api/queue/jobs/ai-analysis/$JOB_ID" "" "$TOKEN"
  fi
fi
echo

# 8. 获取最近完成的任务
echo "8️⃣  最近完成的任务"
test_endpoint "最近完成任务列表" "GET" "/api/queue/ai-analysis/jobs?state=completed&limit=5" "" "$TOKEN"
echo

# 9. 创建每日简报任务
echo "9️⃣  创建每日简报任务"
REPORT_DATA=$(cat <<EOF
{
  "type": "daily-report",
  "data": {
    "date": "$YESTERDAY",
    "metrics": ["active_users", "new_users", "returning_users", "engagement_rate"],
    "source": "all"
  },
  "priority": 2
}
EOF
)

test_endpoint "创建每日简报任务" "POST" "/api/queue/ai-analysis" "$REPORT_DATA" "$TOKEN"
echo

# 总结
echo
echo "============================================"
echo -e "${GREEN}✅ AI 分析功能测试完成！${NC}"
echo "============================================"
echo
echo "下一步:"
echo "1. 访问前端: http://localhost:5173"
echo "2. 导航到: 数据分析 > AI 分析"
echo "3. 查看实时进度和分析结果"
echo
echo "确保以下服务正在运行:"
echo "  - 后端服务: npm start"
echo "  - AI Worker: node src/queues/workers/aiAnalysisWorker.js"
echo "  - Redis: redis-server"
echo "  - 调度器 (可选): node src/queues/scheduler.js"
echo
