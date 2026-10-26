-- 从现有 x_acq_leads 中提取潜在 KOL 账号
-- 执行方式：sqlite3 logearn.db < scripts/extractKolFromLeads.sql

-- 1. 高粉丝数且高质量的线索（Top 50）
SELECT
  'High-quality leads with followers > 1000' as category,
  author_id,
  username,
  name,
  followers,
  score,
  category as lead_type,
  stage,
  bio,
  'https://x.com/i/user/' || author_id as profile_url,
  'https://x.com/i/status/' || best_post_id as best_post_url
FROM x_acq_leads
WHERE followers >= 1000
  AND score >= 50
  AND category IN ('need', 'research', 'other')
  AND stage NOT IN ('dismissed', 'closed')
ORDER BY followers DESC, score DESC
LIMIT 50;

-- 2. 中等粉丝数但高参与度（500-1000 粉丝，但得分很高）
SELECT
  'Mid-tier accounts with high engagement' as category,
  author_id,
  username,
  name,
  followers,
  score,
  category as lead_type,
  bio
FROM x_acq_leads
WHERE followers BETWEEN 500 AND 999
  AND score >= 70
  AND category IN ('need', 'research')
  AND stage NOT IN ('dismissed', 'closed')
ORDER BY score DESC, followers DESC
LIMIT 30;

-- 3. 微型 KOL/研究者（粉丝少但内容质量极高）
SELECT
  'Micro-KOLs with excellent content' as category,
  author_id,
  username,
  name,
  followers,
  score,
  reasons,
  (SELECT COUNT(*) FROM x_acq_posts WHERE lead_id=x_acq_leads.id) as post_count,
  bio
FROM x_acq_leads
WHERE followers < 500
  AND score >= 85  -- 非常高的得分
  AND category = 'need'
  AND stage NOT IN ('dismissed', 'closed')
ORDER BY score DESC
LIMIT 20;

-- 4. 统计各粉丝层级的候选数量
SELECT
  CASE
    WHEN followers >= 10000 THEN '10k+'
    WHEN followers >= 5000 THEN '5k-10k'
    WHEN followers >= 1000 THEN '1k-5k'
    WHEN followers >= 500 THEN '500-1k'
    ELSE '<500'
  END as follower_tier,
  COUNT(*) as count,
  AVG(score) as avg_score,
  COUNT(CASE WHEN score >= 60 THEN 1 END) as high_quality_count
FROM x_acq_leads
WHERE stage NOT IN ('dismissed', 'closed')
GROUP BY follower_tier
ORDER BY MIN(followers) DESC;

-- 5. 按语言和类别分布
SELECT
  CASE
    WHEN bio LIKE '%中文%' OR bio LIKE '%Chinese%' THEN '中文'
    WHEN bio LIKE '%English%' THEN 'English'
    ELSE 'Mixed/Unknown'
  END as language,
  category,
  COUNT(*) as count,
  AVG(followers) as avg_followers,
  AVG(score) as avg_score
FROM x_acq_leads
WHERE followers >= 500
  AND stage NOT IN ('dismissed', 'closed')
GROUP BY language, category
ORDER BY count DESC;

-- 6. 潜在 KOL 导入脚本（生成 INSERT 语句）
-- 注意：需要手动执行这些 INSERT，并确保 owner_id 正确
SELECT
  'INSERT INTO x_kol_accounts(id, owner_id, username, author_id, name, profile_json, stage, created_at, updated_at) VALUES (' ||
  '''' || LOWER(HEX(RANDOMBLOB(16))) || ''', ' ||  -- 生成 UUID
  '''leon'', ' ||  -- 替换为实际 owner_id
  '''' || username || ''', ' ||
  '''' || author_id || ''', ' ||
  '''' || REPLACE(name, '''', '''''') || ''', ' ||
  'NULL, ' ||  -- profile_json 稍后通过 API 填充
  '''watch'', ' ||
  strftime('%s', 'now') || '000, ' ||
  strftime('%s', 'now') || '000' ||
  ');' as import_sql
FROM x_acq_leads
WHERE followers >= 1000
  AND score >= 60
  AND category IN ('need', 'research')
  AND stage NOT IN ('dismissed', 'closed')
  AND author_id IS NOT NULL
ORDER BY followers DESC, score DESC
LIMIT 30;

-- 7. 需要人工审核的高价值账号（粉丝>5k 或得分>80）
SELECT
  'HIGH PRIORITY: Manual review recommended' as priority,
  username,
  name,
  followers,
  score,
  category,
  bio,
  (SELECT text FROM x_acq_posts WHERE lead_id=x_acq_leads.id ORDER BY score DESC LIMIT 1) as best_post_preview,
  'https://x.com/' || username as profile_url
FROM x_acq_leads
WHERE (followers >= 5000 OR score >= 80)
  AND stage NOT IN ('dismissed', 'closed')
ORDER BY followers DESC, score DESC;
