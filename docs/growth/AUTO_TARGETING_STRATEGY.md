# 自动精准抓取 Logearn 用户策略 | 2026-10-26

## 问题诊断

当前关键词太宽泛，抓到很多**求工具的人**，但不是 **Logearn 的理想用户**。

### 当前关键词的问题
```
❌ "筹码 怎么看" → 可能是小白用户，不知道具体需求
❌ "链上工具 推荐" → 太泛化，可能推荐任何工具
❌ "MEME币 怎么查" → 可能只是投机者，不是数据分析需求
```

---

## 🎯 方案 1：基于竞品的精准关键词（最直接）

### 核心思路
抓取**正在使用竞品但有痛点**的用户

### 新增关键词组（替换现有的）

```javascript
// === A. 竞品痛点关键词（优先级最高）===
{
  name:'中文 · Dexscreener 痛点',
  query:'(Dexscreener OR dexscreener) (看不懂 OR 不会用 OR 怎么看 OR 教程 OR 筹码在哪) lang:zh'
},
{
  name:'中文 · Dextools 痛点', 
  query:'(Dextools OR dextools) (看不懂 OR 不会用 OR 怎么看 OR 教程 OR 分析) lang:zh'
},
{
  name:'中文 · Gmgn 痛点',
  query:'(gmgn OR GMGN) (怎么用 OR 看不懂 OR 教程 OR 分析 OR 筹码) lang:zh'
},
{
  name:'中文 · Birdeye 痛点',
  query:'(Birdeye OR birdeye) (怎么用 OR 看不懂 OR 分析 OR 教程) lang:zh'
},

// === B. 具体行为场景（精准需求）===
{
  name:'中文 · 新币研究场景',
  query:'(新币 OR 新代币 OR new token) (怎么查 OR 如何分析 OR 筹码 OR 持仓) -空投 -白名单 lang:zh'
},
{
  name:'中文 · 聪明钱追踪场景',
  query:'(聪明钱 OR 巨鲸) (买了什么 OR 持仓 OR 地址 OR 追踪 OR 钱包) -空投 lang:zh'
},
{
  name:'中文 · Token安全分析',
  query:'(代币 OR token) (安全 OR 风险 OR Rug OR 跑路 OR 骗局) (怎么查 OR 分析 OR 工具) lang:zh'
},

// === C. 高价值用户信号 ===
{
  name:'中文 · 链上数据分析者',
  query:'(我用 OR 我在用 OR 推荐) (Nansen OR Arkham OR Debank OR 链上工具) (但是 OR 可惜 OR 不够 OR 缺少) lang:zh'
},
{
  name:'中文 · Alpha 猎手',
  query:'(Alpha OR alpha OR 早期机会) (链上 OR 筹码 OR 持仓 OR 数据) (发现 OR 寻找 OR 研究) lang:zh'
},
{
  name:'中文 · 量化/策略需求',
  query:'(量化 OR 策略 OR 自动) (链上 OR 筹码 OR 买入信号 OR 监控) (工具 OR 怎么做) lang:zh'
}

// === D. 英文高价值用户 ===
{
  name:'English · Competitor pain points',
  query:'(dexscreener OR dextools OR gmgn OR birdeye) (confusing OR "hard to understand" OR "how to read" OR tutorial OR "holder analysis") -filter:retweets lang:en'
},
{
  name:'English · On-chain analysts',
  query:'("I use" OR "I\'m using") (Nansen OR Arkham OR Dune) ("but need" OR "wish it had" OR "looking for" OR "also need") (holder OR wallet OR distribution) lang:en'
}
```

---

## 🎯 方案 2：基于行为的智能评分（自动过滤）

### 增强评分规则，优先识别高价值用户

```javascript
function scorePostV2(post, now=Date.now()) {
  const text = String(post.text || '');
  let score = 0;
  const reasons = [];

  // === 1. 竞品使用证据（+40 分）===
  const competitorUsage = /(正在用|我用|用过|试过|使用).{0,20}(Dexscreener|Dextools|Gmgn|Birdeye|Nansen|Arkham|Debank)/i.exec(text);
  if (competitorUsage) {
    score += 40;
    reasons.push({kind: 'competitor', evidence: competitorUsage[0], label: '正在使用竞品'});
  }

  // === 2. 痛点表达（+35 分）===
  const painPoint = /(看不懂|不会用|太复杂|太贵|不够|缺少|可惜|没有|希望有|wish.*had|confusing|hard to|difficult)/i.exec(text);
  if (painPoint) {
    score += 35;
    reasons.push({kind: 'pain', evidence: painPoint[0], label: '表达痛点'});
  }

  // === 3. 具体场景（+30 分）===
  const specificScenario = /(新币|新代币|聪明钱买了|巨鲸持仓|Rug检测|安全分析|Alpha机会|早期项目|new token|early gem|whale wallet)/i.exec(text);
  if (specificScenario) {
    score += 30;
    reasons.push({kind: 'scenario', evidence: specificScenario[0], label: '具体使用场景'});
  }

  // === 4. 付费意愿信号（+25 分）===
  const payingIntent = /(付费|订阅|买|购买|值得|多少钱|price|paid|subscription|worth it)/i.exec(text);
  if (payingIntent) {
    score += 25;
    reasons.push({kind: 'paying', evidence: payingIntent[0], label: '有付费意愿'});
  }

  // === 5. 数据分析能力（+20 分）===
  const analyticsSkill = /(我分析|我研究|我看|持仓分布|筹码集中|链上数据|on-chain analysis|holder distribution|wallet analysis)/i.exec(text);
  if (analyticsSkill) {
    score += 20;
    reasons.push({kind: 'skill', evidence: analyticsSkill[0], label: '有数据分析需求'});
  }

  // === 6. 时效性（+15 分）===
  const age = now - Date.parse(post.createdAt);
  if (Number.isFinite(age) && age >= 0 && age < 86400000) {
    score += 15;
    reasons.push({kind: 'fresh', label: '24小时内发布'});
  }

  // === 扣分项 ===
  
  // 小白问题（-20 分）
  const tooBasic = /(什么是区块链|什么是Web3|什么是DeFi|怎么买币|新手|小白|刚入门|what is blockchain|beginner)/i.exec(text);
  if (tooBasic) {
    score -= 20;
    reasons.push({kind: 'basic', evidence: tooBasic[0], label: '过于基础的问题'});
  }

  // 垃圾广告（-80 分）
  const spam = /(空投|白名单|抽奖|保证收益|100x|1000x|加微信|扫码进群|airdrop|giveaway|guaranteed profit)/i.exec(text);
  if (spam) {
    score -= 80;
    reasons.push({kind: 'spam', evidence: spam[0], label: '垃圾广告'});
  }

  // === 分类逻辑 ===
  let category = 'other';
  if (spam) category = 'noise';
  else if (competitorUsage && (painPoint || specificScenario)) category = 'hot_lead'; // 热门线索
  else if (competitorUsage) category = 'competitor_user';
  else if (specificScenario && analyticsSkill) category = 'qualified_lead'; // 合格线索
  else if (tooBasic) category = 'too_early'; // 太早期

  return { score: Math.max(0, Math.min(100, score)), reasons, category };
}
```

---

## 🎯 方案 3：基于互动的自动发现（最智能）

### A. 监控竞品账号的互动者

```javascript
// 新增功能：监控竞品官方账号的互动用户
const COMPETITOR_ACCOUNTS = [
  'dexscreener',
  'dextoolsapp', 
  'gmgnai',
  'birdeye_so',
  'nansen_ai'
];

// 抓取策略：
// 1. 监控这些账号的回复者（有问题/反馈的用户）
// 2. 监控转发+评论者（活跃用户）
// 3. 排除纯转发（无价值）

{
  name: '竞品互动 · Dexscreener',
  query: 'to:dexscreener (问题 OR 建议 OR 怎么 OR 不能 OR bug OR issue OR question) lang:zh'
},
{
  name: '竞品互动 · Gmgn',
  query: 'to:gmgnai (怎么 OR 问题 OR 建议 OR 功能 OR 不懂) lang:zh'
}
```

### B. 监控 Logearn 品牌词

```javascript
{
  name: '品牌词 · Logearn 提及',
  query: '(Logearn OR logearn OR "log earn") -from:logearn_official'
},
{
  name: '品牌词 · 竞品对比',
  query: '(Logearn OR logearn) (vs OR 对比 OR 比较 OR better than OR alternative) (Dexscreener OR Gmgn OR Dextools)'
}
```

---

## 🎯 方案 4：社交图谱扩展（最高效）

### 核心思路
从**已验证的高价值用户**出发，找他们的关注者和互动者

### 实施步骤

```javascript
// 1. 标记种子用户（已验证的理想客户）
const SEED_USERS = [
  'CryptoCharming',  // 已验证：SuDo Research，实际使用筹码分析
  'xiaoyuxiaoyu02',  // 已验证：PTAH 研究，自建看板
  // ... 补充 3-5 个已验证用户
];

// 2. 扩展策略
{
  name: '社交扩展 · CryptoCharming 关注者',
  query: 'following:CryptoCharming (筹码 OR 链上 OR 聪明钱) lang:zh'
},
{
  name: '社交扩展 · 种子用户互动',
  query: '(@CryptoCharming OR @xiaoyuxiaoyu02) (同意 OR 确实 OR 有用 OR 推荐) (工具 OR 分析) lang:zh'
}
```

---

## 🎯 方案 5：行为触发的实时抓取（终极方案）

### 监控高意图行为

```javascript
// A. 实时监控"刚买了新币"的用户
{
  name: '高意图 · 刚买新币',
  query: '(刚买了 OR 买入了 OR just bought OR bought some) (token OR 代币 OR coin) (想看 OR 想查 OR need to check OR analyze) lang:zh OR lang:en'
},

// B. 监控"错过机会"后悔的用户
{
  name: '高意图 · 错过后悔',
  query: '(错过了 OR 没看到 OR 没注意 OR missed) (早期 OR 筹码变化 OR 聪明钱 OR whale movement) lang:zh OR lang:en'
},

// C. 监控"亏损想分析原因"的用户
{
  name: '高意图 · 亏损复盘',
  query: '(亏了 OR 被割 OR rugged OR scammed) (下次 OR 以后) (怎么看 OR 怎么查 OR 分析 OR check) (筹码 OR holder OR wallet) lang:zh OR lang:en'
}
```

---

## 📊 推荐实施方案（分阶段）

### 第 1 周：替换关键词（立即提升精准度）

**移除低价值关键词：**
- ❌ "链上工具推荐"（太泛）
- ❌ "交易工具求助"（太泛）
- ❌ "数据看板"（太泛）

**新增高价值关键词：**
- ✅ Dexscreener/Gmgn 痛点（3 组）
- ✅ 竞品互动监控（2 组）
- ✅ 高意图行为（3 组）

**预期效果：**
- 线索质量从 50/191 (26%) → 60-80%
- 减少垃圾广告从 40% → 10%

### 第 2 周：升级评分算法

**实施 scorePostV2：**
- 竞品使用证据 +40
- 痛点表达 +35
- 具体场景 +30
- 付费意愿 +25

**自动分类：**
- `hot_lead`（热门线索）：正在用竞品+有痛点，score > 75
- `qualified_lead`（合格线索）：有场景+有能力，score > 60
- `too_early`（太早期）：小白问题，自动过滤

### 第 3 周：社交图谱扩展

**从 5 个种子用户出发：**
- 抓取他们的关注者（有相似需求）
- 抓取互动者（有真实兴趣）

**预期：**
- 每个种子用户扩展 20-50 个相似用户
- 总计新增 100-250 个精准线索

### 第 4 周：品牌监控

**持续监控：**
- Logearn 品牌词提及
- 竞品对比讨论
- 推荐和反馈

---

## 🔧 立即执行（今天）

### 1. 替换 3 组低价值关键词

```sql
-- 禁用泛化关键词
UPDATE x_acq_rules 
SET enabled = 0, updated_at = strftime('%s', 'now') * 1000
WHERE name IN ('中文 · 链上工具推荐', '中文 · 交易工具求助', '中文 · 数据看板');

-- 新增高价值关键词
INSERT INTO x_acq_rules(id, owner_id, name, query, enabled, updated_at, cursor)
VALUES
  (lower(hex(randomblob(16))), 'leon', '中文 · Dexscreener痛点', '(Dexscreener OR dexscreener) (看不懂 OR 不会用 OR 怎么看 OR 教程 OR 筹码在哪) lang:zh', 1, strftime('%s', 'now') * 1000, ''),
  (lower(hex(randomblob(16))), 'leon', '中文 · Gmgn痛点', '(gmgn OR GMGN) (怎么用 OR 看不懂 OR 教程 OR 分析 OR 筹码) lang:zh', 1, strftime('%s', 'now') * 1000, ''),
  (lower(hex(randomblob(16))), 'leon', '中文 · 新币研究场景', '(新币 OR 新代币 OR new token) (怎么查 OR 如何分析 OR 筹码 OR 持仓) -空投 -白名单 lang:zh', 1, strftime('%s', 'now') * 1000, '');
```

### 2. 升级评分函数

```bash
# 备份当前文件
cp backend/src/analytics/xAcquisition.js backend/src/analytics/xAcquisition.js.backup

# 我会创建升级版评分函数
```

### 3. 触发一次测试采集

观察新关键词的线索质量

---

## 💡 额外优化建议

### A. 负面关键词优化

在所有 query 中统一添加排除词：
```
-空投 -白名单 -抽奖 -保证收益 -airdrop -giveaway -whitelist
```

### B. 时间窗口优化

优先抓取最近 7 天的内容：
- 新币研究：用户在研究时最需要工具
- 痛点反馈：问题刚发生，切换意愿最强

### C. 粉丝数过滤

调整策略：
- KOL（>10k 粉丝）：合作推广
- 中坚用户（1k-10k）：种子用户+口碑
- **活跃用户（100-1k）：最易转化** ← 当前被忽略！

---

## 📈 预期效果对比

| 指标 | 当前（泛化关键词）| 优化后（精准关键词）|
|------|------------------|---------------------|
| 日均新线索 | 20-30 | 15-25 |
| 高质量占比 | 26% (50/191) | **60-80%** |
| 噪音占比 | 40% | **<10%** |
| 热门线索（可立即联系）| ~5 个/周 | **15-20 个/周** |
| 转化成本 | 未知 | **预计降低 50%** |

---

**核心理念：**
- ❌ 不要抓"所有想要工具的人"
- ✅ 只抓"正在用竞品但有痛点的人"
- ✅ 只抓"有具体场景和分析能力的人"

这样才能自动、精准地找到 Logearn 的理想用户！
