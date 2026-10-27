const {attachAccounts}=require('../analytics/kolAccounts')
const db=require('../db/connection'),remote=require('../data/hologres'),{createHash}=require('node:crypto'),{rankingMetrics,orderRanking}=require('../data/kolRanking'),{validatePeriod}=require('../analytics/kolMetrics')
module.exports=function mount(router,{stages,wrap}){
 router.post('/ranking',wrap(async(req,res)=>{
  const owner=String(req.user.user_id),b=req.body,period=validatePeriod(b),q=String(b.q||'').trim().slice(0,128).toLowerCase(),stage=String(b.stage||''),assignee=String(b.assignee||''),sort=b.sort||'updated_at',direction=b.direction||'desc',scope=b.scope||'tagged',view=b.view||'all'
  const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
  if(stage&&!stages.includes(stage)||!['tagged','own','invited'].includes(scope)||!['asc','desc'].includes(direction)||!['all','due','analysed','unobserved','traded','analysis_no_trade','declining','low_usage','high_value'].includes(view)||!['name','updated_at','next_followup_at','users','analysis_users','analysis_events','analysis_days','analysis_rate','trade_users','transactions','volume_usd','last_analysis_at'].includes(sort))fail('未知KOL排序或关注条件')
  const thresholds={decline_pct:b.decline_pct??30,low_events:b.low_events??3,high_volume:b.high_volume??1000}
  if(!Number.isFinite(thresholds.decline_pct)||thresholds.decline_pct<0||thresholds.decline_pct>100||!Number.isSafeInteger(thresholds.low_events)||thresholds.low_events<0||thresholds.low_events>1000000||!Number.isFinite(thresholds.high_volume)||thresholds.high_volume<0||thresholds.high_volume>1e12)fail('关注阈值无效')
  const offset=b.offset??0,limit=b.limit??50;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)fail('分页参数无效')
  const all=()=>attachAccounts(db,db.prepare('SELECT * FROM crm_kols WHERE owner_id=? ORDER BY id').all(owner)),rows=all(),version=rs=>createHash('sha1').update(JSON.stringify(rs.map(r=>[r.id,r.updated_at]))).digest('hex'),listVersion=version(rows)
  if(b.list_version&&b.list_version!==listVersion)fail('KOL档案或名单已更新，请刷新列表',409)
  let filtered=rows.filter(r=>(!stage||r.stage===stage)&&(!assignee||r.assignee===assignee)&&(!q||[r.name,r.platform,...r.account_ids,r.tags,r.assignee].some(v=>v?.toLowerCase().includes(q))))
  const now=Date.now(),due=r=>r.next_followup_at!=null&&r.next_followup_at<=now&&!['暂停','已结束'].includes(r.stage)
  if(view==='due')filtered=filtered.filter(due)
  const businessSort=!['name','updated_at','next_followup_at'].includes(sort),businessView=!['all','due'].includes(view),global=businessSort||businessView
  const candidates=global?filtered:orderRanking(filtered,sort,direction).slice(offset,offset+limit)
  const profiles=candidates.map(p=>({...p,user_ids:db.prepare('SELECT user_id FROM crm_kol_members WHERE kol_id=?').all(p.id).map(m=>m.user_id)}))
  const online=process.env.ANALYTICS_STORAGE==='hologres';if(!online&&global)fail('KOL效果排序需要真实远程数据源',501)
  const s=online?(b.snapshot_id?await remote.snapshot(String(b.snapshot_id)):await remote.status()):{snapshot_id:null,snapshot_cutoff:new Date().toISOString()}
  const result=online?await remote.cached(JSON.stringify(['kol-ranking',owner,listVersion,s.snapshot_id,period,scope,profiles.map(p=>p.id)]),()=>rankingMetrics(profiles,period,scope,s),30000):{metrics:profiles.map(p=>({id:p.id,total:null,reason:'业务指标需要真实远程数据源'})),errors:{}}
  if((global&&(result.errors.account||result.errors.referral))||((businessSort&&['analysis_users','analysis_events','analysis_days','analysis_rate','last_analysis_at'].includes(sort)||['analysed','unobserved','analysis_no_trade'].includes(view))&&result.errors.analysis)||((businessSort&&['trade_users','transactions','volume_usd'].includes(sort)||['traded','analysis_no_trade'].includes(view))&&result.errors.trade))fail('当前排序或关注条件所需数据不完整，请刷新后重试',503)
  let previous=null;const wantsTrend=b.include_trend===true||view==='declining'
  if(online&&wantsTrend){const span=period.end-period.start,prior={start:period.start-span,end:period.start};if(prior.start<0)fail('前一统计期无效');previous=await remote.cached(JSON.stringify(['kol-ranking-prior',owner,listVersion,s.snapshot_id,prior,scope,profiles.map(p=>p.id)]),()=>rankingMetrics(profiles,prior,scope,s),30000)}
  const prevMap=new Map((previous?.metrics||[]).map(m=>[m.id,m])),trend=m=>{const current=m.total?.analysis_events,prev=prevMap.get(m.id)?.total?.analysis_events;return {previous:prevMap.get(m.id)?.total??null,analysis_change:current==null||prev==null?null:current-prev,analysis_change_rate:current==null||prev==null||prev===0?null:(current-prev)/prev,previous_unavailable:!previous||Object.values(previous.errors||{}).some(Boolean)}}
  const map=new Map(result.metrics.map(m=>[m.id,{...m,trend:trend(m)}])),accept=r=>{const t=r.metric?.total;return !businessView||!!t&&t.users>0&&(view==='analysed'?t.analysis_users>0:view==='unobserved'?t.analysis_users===0:view==='traded'?t.trade_users>0:view==='declining'?r.metric.trend.analysis_change_rate!=null&&r.metric.trend.analysis_change_rate<=-thresholds.decline_pct/100&&r.metric.trend.analysis_change<0:view==='low_usage'?t.analysis_events!=null&&t.analysis_events<thresholds.low_events:view==='high_value'?t.volume_usd!=null&&t.volume_usd>=thresholds.high_volume:t.analysis_users>0&&t.transactions===0)}
  if(view==='declining'&&(!previous||Object.values(previous.errors||{}).some(Boolean)||result.errors.analysis)||view==='low_usage'&&result.errors.analysis||view==='high_value'&&result.errors.trade)fail('关注视图所需数据不完整，请刷新后重试',503)
  const ranked=orderRanking(candidates.map(p=>({...p,metric:map.get(p.id)})).filter(accept),sort,direction),total=global?ranked.length:filtered.length
  if(version(all())!==listVersion)fail('计算期间KOL档案或名单已更新，请刷新列表',409)
  res.json({kols:global?ranked.slice(offset,offset+limit):ranked,total,offset,limit,scope,sort,direction,view,list_version:listVersion,snapshot_id:s.snapshot_id,as_of:s.snapshot_cutoff,...period,errors:result.errors,assignees:[...new Set(rows.map(r=>r.assignee).filter(Boolean))],summary:{total:rows.length,due:rows.filter(due).length},thresholds,previous_period:wantsTrend?{start:period.start-(period.end-period.start),end:period.start}:null,previous_errors:previous?.errors||{},ranking_scope:'all_matching'})
 }))
}
