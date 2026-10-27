// 扩展的 X 获客关键词与评分规则
// 基于 xAcquisition.js，新增中文 KOL 发现能力

const STAGES = ['new', 'qualified', 'contacted', 'replied', 'trial', 'closed', 'dismissed']

// 扩展后的种子关键词：从 4 组扩展到 16 组
const EXPANDED_SEEDS = [
  // === 原有关键词（保留） ===
  {name:'中文 · 筹码与持仓问题', query:'(筹码 OR 持仓分布 OR 持币地址) (怎么看 OR 怎么查 OR 工具 OR 推荐) (链上 OR 代币 OR 钱包 OR token OR meme) -filter:retweets lang:zh'},
  {name:'中文 · 关联钱包研究', query:'(关联钱包 OR 聪明钱 OR 巨鲸钱包) (怎么 OR 工具 OR 推荐) -filter:retweets lang:zh'},
  {name:'English · Holder research', query:'("token holders" OR "holder distribution" OR "token distribution") ("looking for" OR "anyone know" OR "how do I" OR "how can I" OR "recommend a tool") -filter:retweets lang:en'},
  {name:'English · Wallet research', query:'("wallet tracking" OR "wallet analysis" OR "linked wallets") ("looking for" OR "anyone know" OR "how do I" OR "how can I" OR recommend) -filter:retweets lang:en'},

  // === 新增：链上工具与分析类 ===
  {name:'中文 · 链上工具推荐', query:'(链上工具 OR 链上分析 OR 数据工具 OR 链上数据) (推荐 OR 好用 OR 必备 OR 常用) -filter:retweets lang:zh'},
  {name:'中文 · MEME工具研究', query:'(MEME币 OR 土狗 OR 山寨币) (怎么查 OR 工具 OR 看板 OR 分析) (链上 OR 持仓 OR 风险 OR 筹码) -filter:retweets lang:zh'},
  {name:'中文 · 聪明钱追踪', query:'(聪明钱 OR 巨鲸动向 OR 大户追踪 OR 链上大户) (工具 OR 怎么看 OR 推荐 OR 监控) -filter:retweets lang:zh'},
  {name:'中文 · 数据平台使用', query:'(Dune OR Nansen OR Arkham OR Debank OR Etherscan) (使用 OR 教程 OR 怎么用 OR 看懂) lang:zh'},

  // === 新增：Web3 教学与内容类 ===
  {name:'中文 · Token研究教学', query:'(代币研究 OR Token分析 OR 项目分析 OR 链上研究) (教程 OR 方法 OR 框架 OR 步骤) -filter:retweets lang:zh'},
  {name:'中文 · 链上信号解读', query:'(链上信号 OR 链上指标 OR 链上数据) (怎么看 OR 解读 OR 分析 OR 理解) -filter:retweets lang:zh'},
  {name:'中文 · 新币发现', query:'(新币 OR 新项目 OR 早期项目 OR 新代币) (发现 OR 筛选 OR 工具 OR 监控) -filter:retweets lang:zh'},
  {name:'中文 · DeFi策略', query:'(DeFi策略 OR 链上策略 OR 自动交易 OR 量化) (工具 OR 机器人 OR 教程 OR 推荐) -filter:retweets lang:zh'},

  // === 新增：垂直社群与问题类 ===
  {name:'中文 · 交易工具求助', query:'(求推荐 OR 有没有好用的 OR 哪个工具比较好) (交易 OR 分析 OR 监控 OR 看盘) (链上 OR 代币 OR 筹码) lang:zh'},
  {name:'中文 · 风险评估工具', query:'(风险评估 OR 安全检测 OR 合约审计 OR 代币检测) (工具 OR 怎么查 OR 推荐 OR 平台) -filter:retweets lang:zh'},
  {name:'中文 · 空投项目追踪', query:'(空投工具 OR 早期项目追踪 OR 交互记录 OR 链上交互) (推荐 OR 怎么查 OR 工具 OR 监控) lang:zh'},
  {name:'中文 · 数据看板', query:'(看板 OR 仪表盘 OR dashboard OR 数据面板) (链上 OR 数据 OR 分析 OR Token) (搭建 OR 工具 OR 推荐) lang:zh'},
]

// 优化后的评分函数：增加教学和工具评测维度
function scorePostEnhanced(post, now=Date.now()) {
  const text=String(post.text||''), reasons=[]

  // === 原有逻辑：领域匹配 ===
  let domain=/(筹码|持仓|持币|关联钱包|聪明钱|巨鲸|链上工具|链上分析|链上数据|MEME|土狗|token.{0,20}(holder|distribution)|holder.{0,15}(analysis|distribution)|wallet.{0,15}(track|analys)|linked wallets|data.{0,15}(tool|platform|dashboard))/i.exec(text)
  if(domain&&/^(筹码|持仓|巨鲸)$/.test(domain[0])&&!/(链上|加密|代币|持币|钱包|crypto|token|solana|bsc|ethereum)/i.test(text))domain=null

  // === 原有逻辑：用户意图 ===
  const intent=/(怎么(看|查|找|追踪|分析|判断|识别)|如何(查|找|追踪|判断|识别)|求推荐|有没有.{0,20}(工具|方法)|哪个.{0,12}工具|请问|看不懂|找不到.{0,12}工具|looking for\b|(?:can|could).{0,10}(?:you|anyone).{0,10}recommend|any(?:one|body) (?:know|recommend|using)|how (?:do|can|should) (?:i|we)\b|(?:what|which).{0,15}tool\b|is there.{0,15}(?:tool|way)|struggling|can.t.{0,15}(?:find|track|check))/i.exec(text)

  // === 原有逻辑：工具相关 ===
  const tool=/(工具|分析|查询|怎么查|分布|集中度|关联|持币地址|解析|看板|监控|追踪|tool|analys|track|check|distribution|monitor)/i.exec(text)

  // === 新增：教学特征（KOL 内容创作者的核心价值） ===
  const teaching=/(教程|案例|步骤|演示|实操|手把手|详解|深度解析|完整流程|教学|分享|攻略|指南|入门|进阶|tutorial|guide|how.?to|step.by.step)/i.exec(text)

  // === 新增：工具评测（区分推广和评测） ===
  const review=/(实测|对比|优缺点|适合|不适合|推荐理由|使用体验|评测|试用|测评|体验|优势|劣势|review|comparison|pros?.and.cons|recommend.{0,15}because)/i.exec(text)

  // === 新增：实际使用证据（降低纯广告权重） ===
  const usage=/(我(用|试|测试|实操|体验)了|亲测|实战|真实|案例|截图|数据|result|my.{0,10}(experience|test|trial)|I.{0,10}(use|tried|tested))/i.exec(text)

  // === 优化：噪音检测（区分垃圾广告和有价值推广） ===
  const hardNoise=/(airdrop|giveaway|whitelist|白名单|抽奖|空投|保证收益|guaranteed.{0,12}(profit|return)|100x|1000x|加微信|扫码进群|private.?key|seed.phrase|send.{0,10}(eth|usdt)|终身有效|永久免费|立即购买|限时优惠|buy.now|act.now)/i.exec(text)
  const softNoise=/(join.{0,15}(telegram|t\.me)|dm.{0,10}(me|for)|(?:我们|我).{0,8}(?:推出|上线|开发|发布)|你将.{0,8}获得|our (?:tool|platform|product)|we(?:'ve| have| just| are)?.{0,15}(?:launch|introduc|offer)|now offers|try.{0,12}(?:free|our)|bookmark|收藏|评论区)/i.exec(text)

  let score=0

  // === 基础分数 ===
  if(domain){score+=35;reasons.push({kind:'fit',evidence:domain[0],label:'涉及筹码、钱包或链上数据研究'})}
  if(intent){score+=35;reasons.push({kind:'intent',evidence:intent[0],label:'出现提问或求推荐表达'})}
  if(tool){score+=15;reasons.push({kind:'task',evidence:tool[0],label:'涉及工具或分析任务'})}

  // === 新增加分项 ===
  if(teaching){score+=25;reasons.push({kind:'teaching',evidence:teaching[0],label:'包含教学或教程内容'})}
  if(review){score+=20;reasons.push({kind:'review',evidence:review[0],label:'包含工具评测或对比'})}
  if(usage){score+=15;reasons.push({kind:'usage',evidence:usage[0],label:'有实际使用证据'})}

  // === 时效性 ===
  const age=now-Date.parse(post.createdAt)
  if(Number.isFinite(age)&&age>=0&&age<86400000){score+=15;reasons.push({kind:'fresh',label:'评分时发布未满24小时'})}

  // === 优化扣分逻辑 ===
  if(hardNoise){
    // 硬噪音：直接低分
    score-=80
    reasons.push({kind:'noise',evidence:hardNoise[0],label:'疑似垃圾广告或诈骗内容'})
  } else if(softNoise){
    // 软噪音：如果有教学/评测/使用证据，则轻度扣分；否则重度扣分
    if(teaching||review||usage){
      score-=10
      reasons.push({kind:'promo',evidence:softNoise[0],label:'包含推广元素但有实质内容'})
    }else{
      score-=50
      reasons.push({kind:'noise',evidence:softNoise[0],label:'推广内容但缺少实质分析'})
    }
  }

  if(post.retweeted_tweet){
    // 转推：如果是转推评测/教程，轻度扣分；否则重度扣分
    if(teaching||review){
      score-=15
      reasons.push({kind:'retweet',label:'转推内容，但可能有价值'})
    }else{
      score-=50
      reasons.push({kind:'noise',label:'转推内容'})
    }
  }

  // === 上限约束 ===
  if(!domain||!intent||!tool||text.length>1200)score=Math.min(60,score)
  if(hardNoise)score=Math.min(10,score)

  // === 分类逻辑 ===
  let category='other'
  if(hardNoise)category='noise'
  else if(teaching||review)category='kol'  // 新增 KOL 类别
  else if(domain&&intent)category='need'
  else if(domain)category='research'

  return {
    score:Math.max(0,Math.min(100,score)),
    reasons,
    category,
    // 新增：KOL 倾向性评分（0-100）
    kol_potential:(teaching?30:0)+(review?25:0)+(usage?20:0)+(domain?15:0)+(tool?10:0)-(hardNoise?100:0)-(softNoise&&!teaching?30:0)
  }
}

// 优化回复草稿：增加对 KOL 的识别
function draftReplyEnhanced(post, category) {
  if(category==='noise')return ''

  // 针对 KOL 内容创作者的回复
  if(category==='kol'){
    const zh=/[一-鿿]/.test(post.text||'')
    return zh
      ?'感谢分享链上分析内容！如果您对筹码分布、关联钱包或聪明钱追踪有深入研究，欢迎试用我们的分析工具，期待您的反馈。'
      :'Thanks for sharing on-chain analysis content! If you focus on holder distribution or wallet tracking, we'd love to have you try our analytics tool and hear your feedback.'
  }

  // 原有逻辑
  if(category==='other')return ''
  const zh=/[一-鿿]/.test(post.text||'')
  if(/关联|linked|cluster/i.test(post.text||''))return zh
    ?'关联钱包建议结合资金来源、转账路径和买入时间交叉核对，单一关联不能直接证明属于同一人。你现在主要想确认哪一类关联？'
    :'For linked wallets, it helps to cross-check funding sources, transfer paths and purchase timing. One connection alone does not establish common ownership. Which relationship are you trying to investigate?'
  return zh
    ?'看持仓分布时，建议先区分流动性池、交易所和普通持有人,再检查大地址之间的关联。你现在主要想看集中度，还是持仓变化？'
    :'When reviewing holder distribution, separate liquidity pools and exchange addresses from other holders, then examine connections between large wallets. Are you investigating concentration or changes over time?'
}

function trackingUrl(id) {
  const url=new URL('https://logearn.com/')
  url.search=new URLSearchParams({utm_source:'x',utm_medium:'social_outreach',utm_campaign:'keyword_acquisition',utm_content:id}).toString()
  return url.href
}

module.exports={
  STAGES,
  SEEDS: EXPANDED_SEEDS,  // 导出扩展版
  scorePost: scorePostEnhanced,  // 导出优化版
  draftReply: draftReplyEnhanced,
  trackingUrl,
  // 兼容性：保留原版本供测试对比
  scorePostLegacy: require('./xAcquisition').scorePost,
  SEEDS_LEGACY: require('./xAcquisition').SEEDS
}
