# 中文 KOL 扩展快速实施指南

**目标：** 7 天内从 8 个候选扩展到 30-50 个中文 KOL 候选

---

## 今天就能做的 3 件事（2 小时）

### 1. 提高采集预算（5 分钟）

**方法 A：修改环境变量（推荐）**
```bash
cd backend
echo "X_ACQUISITION_DAILY_USD=5" >> .env
# 或在生产环境设置环境变量
export X_ACQUISITION_DAILY_USD=5
```

**方法 B：临时测试（7 天）**
```bash
# 仅用于验证效果，7 天后评估是否继续
X_ACQUISITION_DAILY_USD=5 npm start
```

**预期效果：**
- 从 $1/天（3-4 次搜索）提升到 $5/天（约 16 次搜索）
- 7 天预算 = $35，预计新增 20-30 个候选

---

### 2. 新增 6 组关键词（30 分钟）

**执行步骤：**

#### 步骤 1：修改关键词配置
```bash
cd backend/src/analytics
```

打开 `xAcquisition.js`，在 `SEEDS` 数组中**追加**以下 6 组关键词：

```javascript
const SEEDS = [
  // === 保留原有 4 组 ===
  {name:'中文 · 筹码与持仓问题', query:'(筹码 OR 持仓分布 OR 持币地址) (怎么看 OR 怎么查 OR 工具 OR 推荐) (链上 OR 代币 OR 钱包 OR token OR meme) -filter:retweets lang:zh'},
  {name:'中文 · 关联钱包研究', query:'(关联钱包 OR 聪明钱 OR 巨鲸钱包) (怎么 OR 工具 OR 推荐) -filter:retweets lang:zh'},
  {name:'English · Holder research', query:'("token holders" OR "holder distribution" OR "token distribution") ("looking for" OR "anyone know" OR "how do I" OR "how can I" OR "recommend a tool") -filter:retweets lang:en'},
  {name:'English · Wallet research', query:'("wallet tracking" OR "wallet analysis" OR "linked wallets") ("looking for" OR "anyone know" OR "how do I" OR "how can I" OR recommend) -filter:retweets lang:en'},

  // === 新增 6 组（先测试这些，效果好再追加更多） ===
  {name:'中文 · 链上工具推荐', query:'(链上工具 OR 链上分析 OR 数据工具) (推荐 OR 好用 OR 必备) -filter:retweets lang:zh'},
  {name:'中文 · MEME工具研究', query:'(MEME币 OR 土狗) (怎么查 OR 工具 OR 看板) (链上 OR 持仓 OR 风险) -filter:retweets lang:zh'},
  {name:'中文 · Token研究教学', query:'(代币研究 OR Token分析 OR 项目分析) (教程 OR 方法 OR 框架) -filter:retweets lang:zh'},
  {name:'中文 · 链上信号解读', query:'(链上信号 OR 链上指标) (怎么看 OR 解读 OR 分析) -filter:retweets lang:zh'},
  {name:'中文 · 交易工具求助', query:'(求推荐 OR 有没有好用的) (交易 OR 分析 OR 监控) (链上 OR 代币) lang:zh'},
  {name:'中文 · 数据看板', query:'(看板 OR 仪表盘 OR dashboard) (链上 OR 数据 OR 分析) (搭建 OR 工具) lang:zh'},
]
```

#### 步骤 2：重启服务
```bash
cd backend
npm start
# 或使用 pm2: pm2 restart logearn-backend
```

#### 步骤 3：手动触发一次采集（验证）
```bash
# 在前端 X 获客页面点击"立即采集"
# 或通过 API 触发：
curl -X POST http://localhost:3000/api/x-acquisition/collect \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**预期结果：**
- 每次采集覆盖 10 组关键词（原 4 组 + 新 6 组）
- 每轮采集时间：约 5-8 分钟
- 新增帖子：每组约 10-30 条，共 100-300 条/天

---

### 3. 从现有线索提取潜在 KOL（1 小时）

#### 步骤 1：运行 SQL 查询
```bash
cd backend
sqlite3 logearn.db < scripts/extractKolFromLeads.sql > kol_candidates.txt
```

#### 步骤 2：人工审核 Top 20
```bash
# 查看高价值账号
head -50 kol_candidates.txt
```

**筛选标准：**
- 粉丝数 > 1,000
- 得分 > 60
- Bio 包含"链上"、"分析"、"工具"、"Web3"等关键词
- 近期有原创内容（非纯转发账号）

#### 步骤 3：手动添加到 KOL 候选池

**方法 A：通过前端界面（推荐）**
1. 访问 `http://localhost:5173/x-acquisition/kol`
2. 点击"添加候选"
3. 输入 X 用户名（如 `CryptoCharming`）
4. 点击"采集画像"

**方法 B：通过 API**
```bash
# 批量添加（替换 username 列表）
for username in CryptoCharming xiaoyuxiaoyu02 BTCdayu; do
  curl -X POST http://localhost:3000/api/x-acquisition/kol/accounts \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$username\"}"
done
```

**预期结果：**
- 手动添加 5-10 个高质量候选
- 触发自动画像采集
- 为后续合作谈判提供基础

---

## 第 2-3 天：监控与优化（每天 30 分钟）

### 检查采集质量

```bash
cd backend
sqlite3 logearn.db "
SELECT
  COUNT(*) as total_leads,
  COUNT(CASE WHEN category='need' THEN 1 END) as need,
  COUNT(CASE WHEN category='research' THEN 1 END) as research,
  COUNT(CASE WHEN category='noise' THEN 1 END) as noise,
  AVG(score) as avg_score
FROM x_acq_leads
WHERE last_seen_at > strftime('%s', 'now', '-3 days') * 1000
"
```

**期望指标：**
- `noise` 占比 < 40%（如果超过，需要优化关键词）
- `need` + `research` > 50 个新线索
- `avg_score` > 35

### 调整策略

**如果噪音过多（noise > 50%）：**
1. 暂停效果最差的 2 组关键词
2. 增加排除词，如：
   ```javascript
   query: '(原查询) -(空投 OR 抽奖 OR 白名单) -filter:retweets lang:zh'
   ```

**如果高质量候选不足（followers > 1k 的 < 10 个）：**
1. 降低粉丝数门槛到 500
2. 增加"教学"类关键词权重
3. 手动搜索补充（见下方）

---

## 第 4-7 天：扩大规模与人工筛选（每天 1 小时）

### 目标：达到 30-50 个候选，筛选出 5-10 个可合作对象

### 任务清单

#### 1. 继续自动采集（每天自动运行）
- 确保预算充足（`X_ACQUISITION_DAILY_USD=5`）
- 检查 `x_acq_runs` 表，确认采集没有失败

#### 2. 人工补充高质量 KOL（每天 30 分钟）

**方法：手动搜索 + 添加**

在 X 上搜索以下账号类型：
- 关注 CryptoCharming 的账号（"关注列表"）
- 互动过优质链上分析内容的账号
- 使用话题标签：`#链上分析` `#聪明钱` `#Web3工具`

**发现后立即添加：**
```bash
# 前端：X 获客 → KOL 管理 → 添加候选
# 或 API：
curl -X POST http://localhost:3000/api/x-acquisition/kol/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"username": "发现的用户名"}'
```

#### 3. 批量刷新候选画像（每 3 天一次）

```bash
# 查看待刷新的候选
sqlite3 logearn.db "
SELECT id, username, name, followers
FROM x_kol_accounts
WHERE snapshot_id IS NULL  -- 尚未采集画像
   OR fetched_at < strftime('%s', 'now', '-7 days') * 1000  -- 7天未更新
LIMIT 20
"

# 通过前端批量刷新
# X 获客 → KOL 管理 → 选中账号 → 批量刷新
```

#### 4. 人工审阅 Top 15（第 5-6 天，共 2 小时）

**审阅维度（参考 `kolProfiles.js`）：**
- **内容质量**（1-5 分）：原创性、深度、数据支持
- **教学能力**（1-5 分）：是否有教程、案例、演示
- **受众适配**（1-5 分）：粉丝是否关心链上分析/工具
- **合作意愿**（推测）：是否有商业推广、合作案例

**记录审阅结果：**
```bash
# 前端：KOL 详情页 → 审阅画像
# 填写：
# - 定位（如："MEME 研究+链上工具教学"）
# - 标签（如：["链上分析", "教程", "MEME"]）
# - 各维度评分
# - 推荐合作方式
```

#### 5. 筛选出 5-10 个可合作对象（第 7 天）

**筛选标准：**
- 排名 Top 20（系统自动综合评分）
- 人工审阅"受众适配度" ≥ 4 分
- 粉丝数 1k-5k（性价比高，愿意合作）
- 近 30 天活跃（至少 10 条原创内容）

**进入下一步：合作谈判**
```bash
# 标记为"已联系"状态
# 前端：KOL 详情 → 更新状态 → "contacted"
# 记录：
# - 联系时间
# - 联系方式（DM / 邮箱）
# - 预期合作方式（内容合作 / 试用评测）
```

---

## 第 8-14 天：合作谈判与首批验证（每天 1-2 小时）

### 目标：完成 2-3 个 KOL 合作，验证带客效果

#### 1. 合作提案模板

**邮件/DM 草稿：**

> 你好 @{username}，
>
> 我是 Logearn 的增长负责人。注意到你在链上分析/MEME 研究方面有很多深入内容，特别是 {具体帖子链接} 这篇。
>
> Logearn 是一个 AI 驱动的链上分析工具，专注于筹码分布、关联钱包和聪明钱追踪。我们想邀请你：
>
> 1. **免费试用** 我们的全部功能（14 天完整权限）
> 2. **内容合作**：如果你觉得值得推荐，我们可以支付 $60-120 的固定合作费，制作一期教学内容
> 3. **长期合作**：表现好的话，可以探讨长期内容合作或分成模式
>
> 不强求推广，核心是希望听到你作为专业用户的真实反馈。有兴趣的话我们可以先聊聊你的研究场景。
>
> 期待你的回复！

#### 2. 合作成本预算

| 合作类型 | 单价 | 数量 | 小计 |
|---------|------|------|------|
| 微型 KOL（1k-3k 粉丝） | $40-60 | 2 位 | $100-120 |
| 中型 KOL（3k-10k 粉丝） | $80-120 | 1 位 | $80-120 |
| **首批总预算** | - | **3 位** | **$180-240** |

#### 3. 交付物要求

**每位 KOL 需交付：**
- 1 篇长文或 1 个短视频（5-10 分钟）
- 标题包含"Logearn"或"链上分析工具"
- 带 UTM 链接（我们提供）
- 真实使用体验，不要求全部正面

**验收标准：**
- 内容已发布且可访问
- 带标链接可点击
- 至少 3 个真实用户通过链接访问并完成注册

#### 4. 效果追踪

**必须配置的 UTM 参数：**
```javascript
// 为每位 KOL 生成唯一链接
const kolLink = `https://logearn.com/?utm_source=x&utm_medium=kol&utm_campaign=chinese_trial&utm_content=${kol_username}`
```

**追踪指标（7 天观察期）：**
- 带标访问数（`entry_source` 包含 UTM）
- 注册用户数（需身份归并）
- 首次分析用户数
- D1/D7 留存率

**成功标准（首批验证）：**
- 单个 KOL 带来 ≥ 3 个首次分析用户
- 获客成本 < $40/人（$120 预算 ÷ 3 人）
- 至少 1 人 D7 回访

---

## 监控仪表板

### 每日检查（5 分钟）

```bash
# 1. 采集状态
curl http://localhost:3000/api/x-acquisition | jq '.running, .runs[0]'

# 2. 新增候选数
sqlite3 logearn.db "
SELECT DATE(first_seen_at/1000, 'unixepoch') as date,
       COUNT(*) as new_leads
FROM x_acq_leads
WHERE first_seen_at > strftime('%s', 'now', '-7 days') * 1000
GROUP BY date
ORDER BY date DESC
"

# 3. KOL 候选池规模
sqlite3 logearn.db "
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN snapshot_id IS NOT NULL THEN 1 END) as with_profile,
  COUNT(CASE WHEN review_id IS NOT NULL THEN 1 END) as reviewed
FROM x_kol_accounts
WHERE owner_id='leon'  -- 替换为实际 owner_id
"
```

### 每周复盘（30 分钟，周一）

**复盘问题清单：**
1. 本周新增候选数 vs. 目标（目标：20-30 个/周）
2. 高质量候选占比（followers > 1k 且 score > 60）
3. 预算使用情况（是否接近每日 $5 上限）
4. 噪音比例（noise 类别占比）
5. 人工审阅进度（已审阅 / 待审阅）
6. 合作谈判进展（已联系 / 已回复 / 已合作）

**调整决策：**
- **如果候选数不足**：增加关键词或提高预算
- **如果噪音过多**：优化排除词或降低评分阈值
- **如果合作转化低**：优化提案话术或调整目标 KOL 层级

---

## 常见问题

### Q1: 采集失败，显示"密钥无效"
**A:** 检查环境变量 `TWITTERAPI_IO_API_KEY`
```bash
echo $TWITTERAPI_IO_API_KEY
# 如果为空，在 .env 中设置
```

### Q2: 新增关键词后没有新线索
**A:** 可能的原因：
1. 关键词过于严格，匹配帖子很少
2. 采集间隔设置过长（默认 30 分钟）
3. 预算已用完（检查 `x_acq_spend` 表）

**解决方法：**
```bash
# 查看最近一次采集日志
sqlite3 logearn.db "
SELECT * FROM x_acq_runs
ORDER BY started_at DESC
LIMIT 1
"

# 查看今日预算使用
sqlite3 logearn.db "
SELECT SUM(credits) / 100000.0 as spent_usd
FROM x_acq_spend
WHERE at > strftime('%s', 'now', 'start of day') * 1000
"
```

### Q3: KOL 画像采集失败
**A:** 可能是账号被保护或用户名错误
```bash
# 手动验证账号存在
curl "https://x.com/{username}"

# 检查 API 限制
curl -H "X-API-Key: $TWITTERAPI_IO_API_KEY" \
  "https://api.twitterapi.io/v1/users/by/username/{username}"
```

### Q4: 如何回滚到原版本（如果新关键词效果不好）
**A:** Git 回滚
```bash
git checkout HEAD -- backend/src/analytics/xAcquisition.js
npm start
```

---

## 成功检查清单

### 第 7 天验收

- [ ] 采集预算已提高到 $5/天
- [ ] 已新增至少 6 组关键词
- [ ] 候选池达到 30-50 个
- [ ] 从现有线索提取至少 10 个潜在 KOL
- [ ] 人工审阅 Top 15 候选
- [ ] 筛选出 5-10 个可合作对象
- [ ] 噪音占比 < 50%
- [ ] 高质量候选（followers > 1k）≥ 15 个

### 第 14 天验收

- [ ] 已联系 5-10 个 KOL
- [ ] 完成 2-3 个合作谈判
- [ ] 至少 1 个 KOL 已发布内容
- [ ] 带标链接已配置并可追踪
- [ ] 至少 3 个用户通过 KOL 链接注册
- [ ] 单 KOL 获客成本 < $40/人
- [ ] 至少 1 个用户 D7 留存

---

## 下一步（第 3-4 周）

如果首批验证成功，可以：
1. **扩大预算**：从 $5/天提升到 $10/天
2. **新增更多关键词**：补充剩余 6 组（见完整方案）
3. **增加合作 KOL**：从 3 位扩展到 5-10 位/月
4. **优化评分模型**：根据实际转化率调整 `scorePost` 权重
5. **建立 KOL 社群**：促进相互引荐和内容协作

---

**文档版本：** v1.0  
**最后更新：** 2026-10-26  
**预计完成时间：** 7-14 天  
**预算：** $35-50（采集）+ $180-240（合作） = $215-290
