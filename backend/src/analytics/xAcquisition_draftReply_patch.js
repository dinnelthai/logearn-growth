// 这是 draftReply 函数的改进版本，包含对 KOL 的识别
// 替换 xAcquisition.js 中的 draftReply 函数

function draftReply(post, category) {
  if(category==='noise'||category==='other')return ''

  // 针对 KOL 内容创作者的回复
  if(category==='kol'){
    const zh=/[一-鿿]/.test(post.text||'')
    return zh
      ?'感谢分享链上分析内容！如果您对筹码分布、关联钱包或聪明钱追踪有深入研究，欢迎试用我们的分析工具，期待您的反馈。'
      :'Thanks for sharing on-chain analysis content! If you focus on holder distribution or wallet tracking, we'd love to have you try our analytics tool and hear your feedback.'
  }

  // 原有逻辑：针对普通用户问题
  const zh=/[一-鿿]/.test(post.text||'')
  if(/关联|linked|cluster/i.test(post.text||''))return zh
    ?'关联钱包建议结合资金来源、转账路径和买入时间交叉核对，单一关联不能直接证明属于同一人。你现在主要想确认哪一类关联？'
    :'For linked wallets, it helps to cross-check funding sources, transfer paths and purchase timing. One connection alone does not establish common ownership. Which relationship are you trying to investigate?'
  return zh
    ?'看持仓分布时，建议先区分流动性池、交易所和普通持有人，再检查大地址之间的关联。你现在主要想看集中度，还是持仓变化？'
    :'When reviewing holder distribution, separate liquidity pools and exchange addresses from other holders, then examine connections between large wallets. Are you investigating concentration or changes over time?'
}

module.exports = draftReply
