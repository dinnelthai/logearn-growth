// X 获客 V2：精准定向版本
// 优先识别：竞品用户痛点、具体场景需求、付费意愿

const STAGES = ['new', 'qualified', 'contacted', 'replied', 'trial', 'closed', 'dismissed']

// 精准关键词（基于竞品和痛点）
const SEEDS = [
  // === 竞品痛点（优先级最高）===
  {name:'中文 · Dexscreener痛点', query:'(Dexscreener OR dexscreener) (看不懂 OR 不会用 OR 怎么看 OR 教程 OR 筹码在哪) -空投 -白名单 lang:zh'},
  {name:'中文 · Gmgn痛点', query:'(gmgn OR GMGN) (怎么用 OR 看不懂 OR 教程 OR 分析 OR 筹码) -空投 -白名单 lang:zh'},
  {name:'中文 · Dextools痛点', query:'(Dextools OR dextools) (看不懂 OR 不会用 OR 怎么看 OR 教程 OR 分析) -空投 -白名单 lang:zh'},

  // === 具体场景（精准需求）===
  {name:'中文 · 新币研究场景', query:'(新币 OR 新代币 OR new token) (怎么查 OR 如何分析 OR 筹码 OR 持仓) -空投 -白名单 lang:zh'},
  {name:'中文 · 聪明钱追踪场景', query:'(聪明钱 OR 巨鲸) (买了什么 OR 持仓 OR 地址 OR 追踪 OR 钱包) -空投 -白名单 lang:zh'},
  {name:'中文 · Token安全分析', query:'(代币 OR token) (安全 OR 风险 OR Rug OR 跑路 OR 骗局) (怎么查 OR 分析 OR 工具) lang:zh'},

  // === 高意图行为 ===
  {name:'中文 · 刚买新币', query:'(刚买了 OR 买入了 OR just bought) (token OR 代币 OR coin) (想看 OR 想查 OR 分析) -空投 lang:zh'},
  {name:'中文 · 错过后悔', query:'(错过了 OR 没看到 OR 没注意 OR missed) (早期 OR 筹码变化 OR 聪明钱 OR whale) lang:zh'},

  // === 英文竞品痛点 ===
  {name:'English · Dexscreener pain', query:'(dexscreener OR dextools) (confusing OR "hard to understand" OR "how to read" OR tutorial OR "holder analysis") -airdrop -giveaway -filter:retweets lang:en'},
  {name:'English · Competitor users', query:'("I use" OR "I\'m using") (Nansen OR Arkham OR Dune) ("but need" OR "wish it had" OR "looking for") (holder OR wallet OR distribution) lang:en'},
]

// 精准评分函数 V2
function scorePost(post, now=Date.now()) {
  const text = String(post.text || '');
  let score = 0;
  const reasons = [];

  // === 1. 竞品使用证据（+40 分）===
  const competitorUsage = /(正在用|我用|用过|试过|使用|I use|I'm using|I tried).{0,30}(Dexscreener|Dextools|Gmgn|Birdeye|Nansen|Arkham|Debank|dexscreener|dextools|gmgn|birdeye|nansen|arkham|debank)/i.exec(text);
  if (competitorUsage) {
    score += 40;
    reasons.push({kind: 'competitor', evidence: competitorUsage[0], label: '正在使用竞品工具'});
  }

  // === 2. 痛点表达（+35 分）===
  const painPoint = /(看不懂|不会用|太复杂|太贵|太慢|不够|缺少|可惜|没有|希望有|不支持|wish.*had|confusing|hard to|difficult|too expensive|missing|doesn't have)/i.exec(text);
  if (painPoint) {
    score += 35;
    reasons.push({kind: 'pain', evidence: painPoint[0], label: '表达明确痛点'});
  }

  // === 3. 具体场景（+30 分）===
  const specificScenario = /(新币|新代币|刚上|聪明钱买了|巨鲸持仓|Rug检测|安全分析|Alpha机会|早期项目|错过了|new token|early gem|whale wallet|just launched|rug check)/i.exec(text);
  if (specificScenario) {
    score += 30;
    reasons.push({kind: 'scenario', evidence: specificScenario[0], label: '具体使用场景'});
  }

  // === 4. 付费意愿信号（+25 分）===
  const payingIntent = /(付费|订阅|买|购买|值得|多少钱|愿意花|price|paid|subscription|worth it|willing to pay)/i.exec(text);
  if (payingIntent) {
    score += 25;
    reasons.push({kind: 'paying', evidence: payingIntent[0], label: '有付费意愿信号'});
  }

  // === 5. 数据分析能力（+20 分）===
  const analyticsSkill = /(我分析|我研究|我看|持仓分布|筹码集中|链上数据|I analyze|I research|on-chain analysis|holder distribution|wallet analysis|smart money tracking)/i.exec(text);
  if (analyticsSkill) {
    score += 20;
    reasons.push({kind: 'skill', evidence: analyticsSkill[0], label: '有数据分析需求和能力'});
  }

  // === 6. 行动意图（+20 分）===
  const actionIntent = /(想找|想用|寻找|需要|急需|求推荐|looking for|need|searching for|recommend|anyone know)/i.exec(text);
  if (actionIntent) {
    score += 20;
    reasons.push({kind: 'intent', evidence: actionIntent[0], label: '有行动意图'});
  }

  // === 7. 时效性（+15 分）===
  const age = now - Date.parse(post.createdAt);
  if (Number.isFinite(age) && age >= 0 && age < 86400000) {
    score += 15;
    reasons.push({kind: 'fresh', label: '24小时内发布'});
  }

  // === 扣分项 ===

  // 小白问题（-20 分）
  const tooBasic = /(什么是区块链|什么是Web3|什么是DeFi|怎么买币|新手教程|小白|刚入门|完全不懂|what is blockchain|complete beginner|never used crypto)/i.exec(text);
  if (tooBasic) {
    score -= 20;
    reasons.push({kind: 'too_basic', evidence: tooBasic[0], label: '过于基础，不是目标用户'});
  }

  // 硬垃圾广告（-80 分）
  const hardSpam = /(空投.*立即|白名单.*加入|保证收益|100x.*今天|1000x|加微信|扫码进群|private.?key|seed.phrase|guaranteed profit|airdrop.*now|giveaway.*join|whitelist.*spots)/i.exec(text);
  if (hardSpam) {
    score -= 80;
    reasons.push({kind: 'spam', evidence: hardSpam[0], label: '垃圾广告'});
  }

  // 软推广（轻度扣分）
  const softPromo = /(我们推出|我们上线|我们的工具|our tool|we just launched|check out our)/i.exec(text);
  if (softPromo && !analyticsSkill && !competitorUsage) {
    score -= 15;
    reasons.push({kind: 'promo', evidence: softPromo[0], label: '推广内容'});
  }

  // 纯转推（-10 分）
  if (post.retweeted_tweet && !painPoint && !actionIntent) {
    score -= 10;
    reasons.push({kind: 'retweet', label: '纯转推，无实质内容'});
  }

  // === 分类逻辑（更精细）===
  let category = 'other';

  if (hardSpam) {
    category = 'noise';
  } else if (competitorUsage && (painPoint || specificScenario)) {
    category = 'hot_lead'; // 热门线索：正在用竞品+有痛点
  } else if (competitorUsage) {
    category = 'competitor_user'; // 竞品用户
  } else if (specificScenario && analyticsSkill) {
    category = 'qualified_lead'; // 合格线索：有场景+有能力
  } else if (specificScenario || actionIntent) {
    category = 'potential'; // 潜在线索
  } else if (tooBasic) {
    category = 'too_early'; // 太早期，不是目标用户
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    category,
    // 新增：优先级标签
    priority: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'
  };
}

// 针对不同类别的回复草稿
function draftReply(post, category) {
  if (category === 'noise' || category === 'too_early' || category === 'other') return '';

  const zh = /[一-鿿]/.test(post.text || '');

  // 热门线索（最高优先级）
  if (category === 'hot_lead') {
    return zh
      ? '看到你在用 Dexscreener/Gmgn 遇到了问题。Logearn 专注于让筹码分析更易懂，提供清晰的持仓变化追踪和聪明钱监控。有兴趣试用一下吗？'
      : 'Noticed you're having issues with Dexscreener/Gmgn. Logearn focuses on making holder analysis clearer with easy-to-understand visualizations and smart money tracking. Would you like to try it?';
  }

  // 竞品用户
  if (category === 'competitor_user') {
    return zh
      ? '你正在用的工具不错，Logearn 可以作为补充，特别是在关联钱包分析和筹码变化追踪方面。'
      : 'The tools you\'re using are good. Logearn can complement them, especially for linked wallet analysis and holder change tracking.';
  }

  // 合格线索
  if (category === 'qualified_lead') {
    return zh
      ? '看起来你在做链上研究。Logearn 的筹码分布和聪明钱追踪功能可能对你有帮助，欢迎试用。'
      : 'Looks like you\'re doing on-chain research. Logearn\'s holder distribution and smart money tracking features might help. Feel free to try it out.';
  }

  // 潜在线索（通用）
  return zh
    ? '研究新币时，建议先看持仓分布和大户变化，再结合资金流向做判断。需要工具的话可以试试 Logearn。'
    : 'When researching new tokens, start with holder distribution and whale movements, then cross-check with fund flows. Try Logearn if you need a tool for this.';
}

function trackingUrl(id) {
  const url = new URL('https://logearn.com/');
  url.search = new URLSearchParams({
    utm_source: 'x',
    utm_medium: 'social_outreach',
    utm_campaign: 'precision_targeting_v2',
    utm_content: id
  }).toString();
  return url.href;
}

module.exports = { STAGES, SEEDS, scorePost, draftReply, trackingUrl };
