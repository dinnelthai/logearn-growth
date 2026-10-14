const {parentPort,workerData} = require('node:worker_threads')
const remote=require('../data/hologres')
const {loadUsers,features,retentionUsers,orderedFunnelUsers}=require('../data/remoteUsers')
const {computeFunnel}=require('../analytics/funnel')
const {buildCohorts,retainedUsers,toDateStr}=require('../analytics/retention')
async function run({kind,body,snapshot:s,audience,owner}){
  const {start,end}=body,asOf=Date.parse(s.as_of),source=body.source||'all',lists={}
  if(kind==='channels')return require('../analytics/channelInsights').channelInsights(await require('../data/channelFacts').channelFacts(s,body,audience),body,s)
  if(kind==='paths')return require('../analytics/pathInsights').pathInsights(await require('../data/behaviorPaths').pathUsers(s,body,audience),body,s)
  if(kind==='trade-monitor')return require('../analytics/tradeInsights').computeTradeInsights(await require('../data/tradeEvents').tradeEvents(s,body,audience),{start,end,asOf,chain:body.chain||'all'})
  if(kind==='referral'){
    const rows=await features(s)
    const relations=await require('../data/referralFacts').referralFacts(s)
    return require('../analytics/referralInsights').computeReferralInsights(rows,relations,{start,end,asOf,factsAsOf:Date.parse(s.snapshot_cutoff),scope:body.scope||'all',quality:body.quality||'all',source,inviter:body.inviter||null,windowDays:Number(body.window_days)||28,audience})
  }
  if(kind==='segments'){
    const {computeInsights}=require('../analytics/segmentInsights')
    const factsAsOf=Date.parse(s.snapshot_cutoff),periodEnd=body.end??factsAsOf+1,periodStart=body.start??periodEnd-7*86400000
    const rows=await features(s,source,audience,{start:periodStart,end:periodEnd})
    const pointsData=await require('../data/pointsFacts').pointsFacts(s,{start:periodStart,end:periodEnd})
    const points=require('../analytics/pointsInsights').preparePoints(pointsData,periodStart,periodEnd)
    const creditsData=await require('../data/creditsFacts').creditsFacts(s)
    let urlSingles=new Set(),urlTokens=new Set()
    if(['single_page_no_action','token_detail_no_analysis'].includes(body.filters?.task)){
      const pageUsers=await require('../data/behaviorPaths').pathUsers(s,{start:periodStart,end:periodEnd,source},audience)
      const visits=require('../analytics/pageVisits').pageVisits(pageUsers,{start:periodStart,end:periodEnd,asOf})
      urlSingles=new Set(visits.lists['url:single']);urlTokens=new Set(visits.lists['url:token_no_analysis'])
    }
    const tagMap=new Map()
    const scopedTags=require('../analytics/userTags').userTags(owner,{userIds:rows.map(r=>r.user_key)})
    const selectedTags=new Set((body.user_tag_snapshot||[]).map(t=>t.id))
    for(const tag of [...scopedTags.filter(t=>!selectedTags.has(t.id)),...(body.user_tag_snapshot||[])])for(const id of tag.user_ids){if(!tagMap.has(id))tagMap.set(id,[]);tagMap.get(id).push({id:tag.id,name:tag.name,type:tag.type})}
    const enriched=rows.map(r=>({...r,operational_tags:tagMap.get(r.user_key)||[],single_page_no_action:urlSingles.has(r.user_key),token_detail_no_analysis:urlTokens.has(r.user_key),...(points.get(String(r.account_id))||{}),...(creditsData.map.get(String(r.account_id))||{})}))
    return require('../analytics/compactDetails').compactDetails(computeInsights(enriched,{asOf,factsAsOf,start:periodStart,end:periodEnd,pointsData,creditsQuality:creditsData.quality,filters:body.filters||{},groupBy:body.group_by||'signal',pool:body.pool||'business',historyComplete:!!s.history_complete}))
  }
  let types=body.steps,startAt=start,endAt=Math.min(asOf+1,end)
  if(kind==='retention'){types=[...new Set([body.initial||'chip',body.returning||'chip'])];startAt=0;endAt=asOf+1}
  if(kind==='funnel')endAt=Math.min(asOf+1,end+(Number(body.hours)||24)*3600000)
  const users=kind==='funnel'&&(!body.association||body.association==='user')?await orderedFunnelUsers(s,body,audience):kind==='retention'?await retentionUsers(s,{initial:body.initial||'chip',returning:body.returning||'chip',start,end,source,audience}):await loadUsers(s,{types,start:startAt,end:endAt,source,audience})
  if(kind==='funnel'){
    const steps=body.steps,r=computeFunnel(users,{steps,startAt:start,endAt:end,asOf,
      conversionWindowMs:(Number(body.hours)||24)*3600000,association:body.association||'user',
      sourceFilter:source,strategyFilter:body.strategy||'all'})
    lists.missing_start=r.quality.missingStartUserIds;lists.incomplete=r.quality.incompleteUserIds
    steps.forEach((_,i)=>lists[`reached:${i}`]=r.rows.filter(x=>x.times.length>i).map(x=>x.userId))
    steps.slice(1).forEach((_,i)=>lists[`drop:${i}`]=r.rows.filter(x=>x.times.length===i+1&&!x.pending&&!x.dataIncomplete).map(x=>x.userId))
    const bySource={}
    for(const row of r.rows){(bySource[row.source]??=[]).push(row)}
    for(const [sourceName,rows]of Object.entries(bySource))lists[`source:${sourceName}`]=rows.map(r=>r.userId)
    return {lists,payload:{association:body.association||'user',steps:r.steps,total_entered:r.total_entered,
      total_converted:r.total_converted,pending_count:r.pending_count,median_conversion_ms:r.median_conversion_ms,
      quality:{missing_start:lists.missing_start.length,incomplete:lists.incomplete.length},
      by_source:Object.entries(bySource).map(([source,rows])=>({source,entered:rows.length,converted:rows.filter(r=>r.times.length===steps.length).length})),
      candidate_count:users.length,truncated:false}}
  }
  if(kind==='retention'){
    const cohorts=buildCohorts(users,{startAt:start,endAt:end,asOf,initialEvent:body.initial||'chip',sourceFilter:source}),daily=[]
    for(const co of cohorts){if(!co.users.length)continue;co.asOf=asOf;const d=toDateStr(co.start);lists[`cohort:${d}`]=co.users.map(u=>u.id);const periods=[]
      for(let p=1;p<=7;p++){const observed=co.start+p*86400000<=asOf,complete=co.start+(p+1)*86400000<=asOf
        if(!observed){periods.push({period:p,retained_users:null,retention_rate:null,complete:false});continue}
        const ids=retainedUsers(co,p,false,body.returning||'chip').map(u=>u.id),cont=retainedUsers(co,p,true,body.returning||'chip').map(u=>u.id)
        lists[`retained:${d}:D${p}`]=ids;lists[`retained:${d}:C${p}`]=cont
        periods.push({period:p,retained_users:ids.length,retention_rate:ids.length/co.users.length,
          continuous_retained_users:cont.length,continuous_retention_rate:cont.length/co.users.length,complete})}
      daily.push({cohort_date:d,cohort_start:co.start,cohort_size:co.users.length,periods})}
    return {lists,payload:{daily,candidate_count:users.length,truncated:false}}
  }
  throw Error('Unknown analysis')
}
run(workerData).then(result=>parentPort.postMessage({result})).catch(err=>parentPort.postMessage({error:err.message,status:err.status||503})).finally(()=>remote.close())
