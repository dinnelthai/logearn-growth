const DAY=86400000
const DIMENSIONS={fit:'产品任务匹配',research:'研究实操',teaching:'内容讲解',community:'社群入口',audience:'受众需求'}
const OBJECTIVES={
  trial:{label:'试用共创',description:'优先找到能实际研究Token、验证产品并共创案例的人',weights:{fit:35,research:30,teaching:20,distribution:5,audience:10}},
  acquisition:{label:'获客合作',description:'比较相关内容表达、可观察分发及产品受众匹配',weights:{fit:30,research:10,teaching:20,distribution:20,audience:20}},
  community:{label:'社群合作',description:'寻找有公开社群入口、适合组织研究体验的候选',weights:{fit:20,research:10,teaching:10,community:40,distribution:10,audience:10}},
}
const STAGES={watch:'观察中',shortlist:'优先跟进',contacted:'已联系',trial:'试用中',collaborating:'合作中',paused:'暂缓'}
const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null}
function metrics(posts,now=Date.now()){
  const unique=[...new Map(posts.map(p=>[String(p.id),p])).values()]
  const recent=unique.filter(p=>{const at=Date.parse(p.createdAt);return Number.isFinite(at)&&at<=now&&at>=now-90*DAY})
  const original=recent.filter(p=>!p.retweeted_tweet&&!p.text?.startsWith('RT @')&&!p.isReply)
  const valid=(key)=>original.map(p=>p[key]).filter(v=>Number.isFinite(v)&&v>=0)
  const dates=original.map(p=>Date.parse(p.createdAt)),signatures=new Set(original.map(p=>String(p.text||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim()))
  return {sample_posts:unique.length,recent_posts:recent.length,original_posts:original.length,original_share:recent.length?original.length/recent.length:null,median_views:median(valid('viewCount')),median_likes:median(valid('likeCount')),median_replies:median(valid('replyCount')),view_coverage:original.filter(p=>Number.isFinite(p.viewCount)&&p.viewCount>=0).length,duplicate_share:original.length?1-signatures.size/original.length:null,span_days:dates.length?(Math.max(...dates)-Math.min(...dates))/DAY:0,latest_post_at:dates.length?Math.max(...dates):null,period_days:90,original}
}
function recommend({review,posts,snapshotId,reviewSnapshotId,fetchedAt},objective='trial',now=Date.now()){
  const spec=OBJECTIVES[objective];if(!spec)throw Object.assign(Error('未知推荐目标'),{status:400})
  const m=metrics(posts,now),stale=now-fetchedAt>7*DAY,needsReview=Boolean(review&&snapshotId!==reviewSnapshotId)
  const evidenceIds=new Set((review?.dimensions?Object.values(review.dimensions):[]).flatMap(d=>d.evidence_ids||[]))
  const related=m.original.filter(p=>evidenceIds.has(String(p.id))),relatedViews=related.map(p=>p.viewCount).filter(v=>Number.isFinite(v)&&v>=0)
  const distribution=relatedViews.length>=3?Math.min(5,Math.max(0,Math.log10(Math.max(1,median(relatedViews))))):null
  let total=0,known=0
  const dimensions=Object.entries(spec.weights).map(([key,weight])=>{
    const d=key==='distribution'?{value:distribution,reason:distribution==null?'至少需要3条已引用的相关原创内容且有曝光数据':'按画像引用的相关原创内容曝光中位数计算；不是转化能力',evidence_ids:related.filter(p=>Number.isFinite(p.viewCount)).map(p=>String(p.id))}:review?.dimensions?.[key]
    const value=typeof d?.value==='number'&&d.value>=0&&d.value<=5?d.value:null
    if(value!=null){total+=value/5*weight;known+=weight}
    return {key,label:key==='distribution'?'相关内容分发':DIMENSIONS[key],weight,value,reason:d?.reason||'尚无足够证据',evidence_ids:d?.evidence_ids||[]}
  })
  const confidence=stale?'stale':!review?'pending':needsReview?'needs_review':m.original_posts<10||m.span_days<7?'limited':m.original_posts>=40&&known>=85?'supported':'moderate'
  const eligible=Boolean(review&&!needsReview&&!stale&&known>=60&&m.original_posts>=3)
  const score=eligible?Math.round(total/known*100):null
  const blockers=[]
  if(!review)blockers.push('内容画像待补充')
  if(needsReview)blockers.push('内容样本已更新，画像待复核')
  if(stale)blockers.push('资料超过7天未刷新')
  if(m.original_posts<3)blockers.push('近90天原创样本不足3条')
  if(known<60)blockers.push('可评分证据覆盖不足60%')
  return {objective,label:spec.label,score,eligible,confidence,coverage:known,dimensions,blockers,related_posts:related.length,related_median_views:median(relatedViews),metrics:{...m,original:undefined},definition:'推荐指数仅比较当前已知维度，缺失项不按0分处理；不是带客概率、收益或转化预测。'}
}
function validateReview(input,posts){
  const fail=message=>{throw Object.assign(Error(message),{status:400})}
  if(!input||typeof input!=='object'||Array.isArray(input))fail('画像格式无效')
  const ids=new Set(posts.map(p=>String(p.id))),value={}
  for(const [key,max]of Object.entries({positioning:800,summary:2000,approach:2000,risks:2000,unknowns:2000})){if(typeof input[key]!=='string'||input[key].length>max||!input[key].trim())fail('请填写完整画像、合作切入点与待核实事项');value[key]=input[key].trim()}
  if(!Array.isArray(input.tags)||input.tags.length>8||input.tags.some(t=>typeof t!=='string'||t.length>30))fail('画像标签格式无效')
  value.tags=input.tags.map(t=>t.trim()).filter(Boolean);value.dimensions={}
  for(const key of Object.keys(DIMENSIONS)){
    const d=input.dimensions?.[key]
    if(!d||d.value!==null&&(!Number.isFinite(d.value)||d.value<0||d.value>5)||typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>500||!Array.isArray(d.evidence_ids)||d.evidence_ids.length>10||d.evidence_ids.some(id=>typeof id!=='string'||!ids.has(id)))fail('画像维度、评分或证据引用无效')
    if(d.value!==null&&!d.evidence_ids.length)fail('每个已评分维度至少需要一条当前样本证据')
    value.dimensions[key]={value:d.value,reason:d.reason.trim(),evidence_ids:[...new Set(d.evidence_ids)]}
  }
  return value
}
function username(input){
  if(typeof input!=='string'||input.length>200)throw Object.assign(Error('请填写有效X用户名或主页链接'),{status:400})
  let name=input.trim().replace(/^@/,'')
  if(/^https?:\/\//.test(name)){
    let url;try{url=new URL(name)}catch{}
    if(!url||!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(url.hostname)||url.username||url.password)throw Object.assign(Error('请使用X主页链接'),{status:400})
    name=url.pathname.replace(/^\//,'').replace(/\/$/,'')
  }
  if(!/^[a-zA-Z0-9_]{1,15}$/.test(name)||['home','search','explore','settings','i'].includes(name.toLowerCase()))throw Object.assign(Error('请填写有效X用户名'),{status:400})
  return name
}
module.exports={OBJECTIVES,DIMENSIONS,STAGES,metrics,recommend,validateReview,username,median}
