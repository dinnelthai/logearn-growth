#!/bin/bash
# 升级到精准定向策略
# 将泛化关键词替换为竞品痛点和高意图关键词

set -e

DB_PATH="${DB_PATH:-./data/analytics.db}"
OWNER_ID="${1:-leon}"

echo "=== 升级到精准定向策略 ==="
echo ""
echo "Owner: $OWNER_ID"
echo "Database: $DB_PATH"
echo ""

# 检查是否有采集任务正在运行
RUNNING=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM x_acq_runs WHERE state='running'")
if [ "$RUNNING" -gt 0 ]; then
  echo "❌ 错误: 有采集任务正在运行，请等待完成"
  exit 1
fi

echo "步骤 1/3: 禁用泛化关键词..."
sqlite3 "$DB_PATH" <<EOF
UPDATE x_acq_rules
SET enabled = 0, updated_at = strftime('%s', 'now') * 1000
WHERE owner_id = '$OWNER_ID'
  AND name IN (
    '中文 · 链上工具推荐',
    '中文 · 交易工具求助',
    '中文 · 数据看板'
  );
EOF

DISABLED=$(sqlite3 "$DB_PATH" "SELECT changes()")
echo "✓ 已禁用 $DISABLED 组泛化关键词"
echo ""

echo "步骤 2/3: 添加精准关键词..."
sqlite3 "$DB_PATH" <<EOF
INSERT INTO x_acq_rules(id, owner_id, name, query, enabled, updated_at, cursor, pending_since, pending_until, complete_until, last_attempt_at, last_error)
VALUES
  -- 竞品痛点
  (lower(hex(randomblob(16))), '$OWNER_ID', '中文 · Dexscreener痛点', '(Dexscreener OR dexscreener) (看不懂 OR 不会用 OR 怎么看 OR 教程 OR 筹码在哪) -空投 -白名单 lang:zh', 1, strftime('%s', 'now') * 1000, '', NULL, NULL, NULL, NULL, NULL),

  (lower(hex(randomblob(16))), '$OWNER_ID', '中文 · Gmgn痛点', '(gmgn OR GMGN) (怎么用 OR 看不懂 OR 教程 OR 分析 OR 筹码) -空投 -白名单 lang:zh', 1, strftime('%s', 'now') * 1000, '', NULL, NULL, NULL, NULL, NULL),

  -- 具体场景
  (lower(hex(randomblob(16))), '$OWNER_ID', '中文 · 新币研究场景', '(新币 OR 新代币 OR new token) (怎么查 OR 如何分析 OR 筹码 OR 持仓) -空投 -白名单 lang:zh', 1, strftime('%s', 'now') * 1000, '', NULL, NULL, NULL, NULL, NULL),

  (lower(hex(randomblob(16))), '$OWNER_ID', '中文 · 聪明钱追踪场景', '(聪明钱 OR 巨鲸) (买了什么 OR 持仓 OR 地址 OR 追踪 OR 钱包) -空投 -白名单 lang:zh', 1, strftime('%s', 'now') * 1000, '', NULL, NULL, NULL, NULL, NULL),

  -- 高意图行为
  (lower(hex(randomblob(16))), '$OWNER_ID', '中文 · 刚买新币', '(刚买了 OR 买入了) (token OR 代币 OR coin) (想看 OR 想查 OR 分析) -空投 lang:zh', 1, strftime('%s', 'now') * 1000, '', NULL, NULL, NULL, NULL, NULL),

  -- 英文竞品痛点
  (lower(hex(randomblob(16))), '$OWNER_ID', 'English · Dexscreener pain', '(dexscreener OR dextools) (confusing OR "hard to understand" OR "how to read" OR tutorial OR "holder analysis") -airdrop -giveaway -filter:retweets lang:en', 1, strftime('%s', 'now') * 1000, '', NULL, NULL, NULL, NULL, NULL);
EOF

echo "✓ 已添加 6 组精准关键词"
echo ""

echo "步骤 3/3: 显示当前状态..."
echo ""
echo "--- 当前启用的关键词 ---"
sqlite3 "$DB_PATH" -header -column <<EOF
SELECT
  name,
  CASE WHEN enabled=1 THEN '✓' ELSE '✗' END as status,
  LENGTH(query) as query_length
FROM x_acq_rules
WHERE owner_id = '$OWNER_ID'
ORDER BY enabled DESC, updated_at DESC;
EOF

echo ""
echo "--- 统计 ---"
sqlite3 "$DB_PATH" <<EOF
SELECT '启用关键词数' as metric, COUNT(*) as count
FROM x_acq_rules
WHERE owner_id='$OWNER_ID' AND enabled=1
UNION ALL
SELECT '禁用关键词数', COUNT(*)
FROM x_acq_rules
WHERE owner_id='$OWNER_ID' AND enabled=0;
EOF

echo ""
echo "✅ 升级完成！"
echo ""
echo "下一步:"
echo "  1. 前端「X 获客」→ 点击「立即采集」"
echo "  2. 等待 5-10 分钟"
echo "  3. 查看新线索质量（预期高质量占比 >60%）"
echo ""
echo "预期效果:"
echo "  - 噪音占比: 40% → <10%"
echo "  - 高质量占比: 26% → 60-80%"
echo "  - 热门线索: ~5/周 → 15-20/周"
