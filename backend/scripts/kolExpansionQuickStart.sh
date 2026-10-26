#!/bin/bash
# KOL 扩展快速启动脚本
# 用法: ./scripts/kolExpansionQuickStart.sh [step]
#   step 1: 提取现有线索中的 KOL 候选
#   step 2: 检查当前关键词和采集状态
#   step 3: 修改预算到 $5/天（需手动确认）

set -e

DB_PATH="${DB_PATH:-./logearn.db}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Logearn KOL 扩展快速启动 ==="
echo ""

# 步骤 1: 提取高质量 KOL 候选
step1_extract_kols() {
  echo "Step 1: 从现有 x_acq_leads 提取 KOL 候选..."
  echo ""

  if [ ! -f "$DB_PATH" ]; then
    echo "错误: 数据库文件不存在: $DB_PATH"
    echo "请先确保后端已运行并创建数据库"
    exit 1
  fi

  # 统计现有线索
  echo "--- 现有线索统计 ---"
  sqlite3 "$DB_PATH" <<EOF
SELECT
  '总线索数: ' || COUNT(*) as stat
FROM x_acq_leads
UNION ALL
SELECT
  '高质量线索(粉丝>1k, 分数>60): ' || COUNT(*)
FROM x_acq_leads
WHERE followers >= 1000 AND score >= 60
UNION ALL
SELECT
  '当前 KOL 候选池: ' || COUNT(*)
FROM x_kol_accounts;
EOF

  echo ""
  echo "--- Top 20 高质量线索（可导入 KOL 候选池）---"
  sqlite3 "$DB_PATH" -header -column <<EOF
SELECT
  username,
  name,
  followers,
  score,
  category,
  SUBSTR(bio, 1, 40) || '...' as bio_preview
FROM x_acq_leads
WHERE followers >= 1000
  AND score >= 60
  AND category IN ('need', 'research', 'kol')
  AND stage NOT IN ('dismissed', 'closed')
ORDER BY followers DESC, score DESC
LIMIT 20;
EOF

  echo ""
  echo "提示: 在前端「X 获客 → KOL 管理」页面可以手动添加这些账号"
  echo "或使用 API: POST /api/x-acquisition/kol/accounts {\"username\": \"xxx\"}"
}

# 步骤 2: 检查当前配置
step2_check_config() {
  echo "Step 2: 检查当前关键词和采集状态..."
  echo ""

  # 检查关键词配置
  echo "--- 当前关键词数量 ---"
  node -e "
    const {SEEDS} = require('$BACKEND_DIR/src/analytics/xAcquisition.js');
    console.log('总关键词组数:', SEEDS.length);
    console.log('中文关键词:', SEEDS.filter(s => s.query.includes('lang:zh')).length);
    console.log('英文关键词:', SEEDS.filter(s => s.query.includes('lang:en')).length);
    console.log('');
    console.log('关键词列表:');
    SEEDS.forEach((s, i) => console.log(\`  \${i+1}. \${s.name}\`));
  "

  echo ""
  echo "--- 最近采集记录 ---"
  sqlite3 "$DB_PATH" -header -column <<EOF
SELECT
  datetime(started_at/1000, 'unixepoch', '+7 hours') as started,
  state,
  rules,
  posts,
  new_leads,
  pages,
  COALESCE(error, 'Success') as status
FROM x_acq_runs
ORDER BY started_at DESC
LIMIT 5;
EOF

  echo ""
  echo "--- 今日预算使用情况 ---"
  sqlite3 "$DB_PATH" <<EOF
SELECT
  'Today budget used: $' || CAST(COALESCE(SUM(credits), 0) / 100000.0 AS TEXT) || ' USD'
FROM x_acq_spend
WHERE at > strftime('%s', 'now', 'start of day', '+7 hours') * 1000;
EOF

  # 检查环境变量
  echo ""
  echo "--- 当前预算配置 ---"
  if [ -f "$BACKEND_DIR/.env" ]; then
    CURRENT_BUDGET=$(grep "X_ACQUISITION_DAILY_USD" "$BACKEND_DIR/.env" | cut -d'=' -f2 || echo "1")
    echo "X_ACQUISITION_DAILY_USD=$CURRENT_BUDGET"
  else
    echo "未找到 .env 文件，使用默认值: $1/天"
  fi

  echo ""
  echo "提示: 建议将预算提升到 \$5-10/天以加速 KOL 发现"
  echo "修改方法: 运行 ./scripts/kolExpansionQuickStart.sh 3"
}

# 步骤 3: 修改预算（交互式）
step3_update_budget() {
  echo "Step 3: 修改采集预算..."
  echo ""

  if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "错误: 未找到 .env 文件"
    echo "请先复制 .env.example 到 .env 并配置基本参数"
    exit 1
  fi

  CURRENT_BUDGET=$(grep "X_ACQUISITION_DAILY_USD" "$BACKEND_DIR/.env" | cut -d'=' -f2 || echo "1")
  echo "当前预算: \$$CURRENT_BUDGET/天"
  echo ""
  echo "建议预算:"
  echo "  \$5/天 - 约 16 组关键词，适合快速扩展（7-14 天）"
  echo "  \$3/天 - 约 10 组关键词，适合稳定运营"
  echo "  \$1/天 - 约 3-4 组关键词（当前默认）"
  echo ""

  read -p "输入新预算（美元/天，回车取消）: " NEW_BUDGET

  if [ -z "$NEW_BUDGET" ]; then
    echo "已取消"
    return
  fi

  # 验证输入
  if ! [[ "$NEW_BUDGET" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "错误: 无效的数字格式"
    exit 1
  fi

  # 备份并修改
  cp "$BACKEND_DIR/.env" "$BACKEND_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
  sed -i.tmp "s/X_ACQUISITION_DAILY_USD=.*/X_ACQUISITION_DAILY_USD=$NEW_BUDGET/" "$BACKEND_DIR/.env"
  rm -f "$BACKEND_DIR/.env.tmp"

  echo ""
  echo "✓ 预算已更新为 \$$NEW_BUDGET/天"
  echo "✓ 原配置已备份到 .env.backup.*"
  echo ""
  echo "下一步:"
  echo "  1. 重启后端服务: npm start (或 pm2 restart logearn-backend)"
  echo "  2. 在前端「X 获客」页面点击「立即采集」验证"
  echo "  3. 观察 1-2 天的采集效果，评估是否需要调整关键词"
}

# 主流程
case "${1:-1}" in
  1)
    step1_extract_kols
    ;;
  2)
    step2_check_config
    ;;
  3)
    step3_update_budget
    ;;
  all)
    step1_extract_kols
    echo ""
    echo "========================================"
    echo ""
    step2_check_config
    echo ""
    echo "========================================"
    echo ""
    step3_update_budget
    ;;
  *)
    echo "用法: $0 [step]"
    echo ""
    echo "步骤:"
    echo "  1    - 提取现有线索中的 KOL 候选"
    echo "  2    - 检查当前关键词和采集状态"
    echo "  3    - 修改预算到 \$5/天（交互式）"
    echo "  all  - 依次执行所有步骤"
    echo ""
    echo "示例:"
    echo "  $0 1        # 查看高质量线索"
    echo "  $0 2        # 检查当前配置"
    echo "  $0 3        # 修改预算"
    echo "  $0 all      # 完整检查+交互设置"
    exit 1
    ;;
esac
