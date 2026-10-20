const {percentile}=require('./requestDiagnostics')
const day=t=>Math.floor((t+25200000)/86400000)
function valueDiagnostics(users,{start,end,asOf},preparedAnalysis){
 const pageClicks=require('./pageClickRates').pageClickRates(users,{start,end,asOf})
 const analysisRows=preparedAnalysis||require('./requestDiagnostics').requestDiagnostics(users,{start,end,asOf}).analysis_rows
 const entrances=[];let missingVisitClicks=0
 const lists={...pageClicks.lists},exposures=new Map(),clicked=new Set(),exposedUsers=new Set(),clickedUsers=new Set();let unmatchedClicks=0
 const cohorts=[],prior=[];let analysisObserved=false,exposureObserved=false
 const conversionWindow=86400000
 for(const u of users){const es=u.events.filter(e=>e.t<=asOf).slice().sort((a,b)=>a.t-b.t)
  for(const e of es){const name=e.raw_name||e.type,p=e.properties||{};if(name==='analysis_requested'||name==='analysis_request_finished')analysisObserved=true
   if(name==='token_card_exposed'){exposureObserved=true;if(e.t<start||e.t>=end||!p.item_exposure_id||!p.page_visit_id)continue;const key=JSON.stringify([u.id,p.page_visit_id,p.item_exposure_id]);if(!exposures.has(key))exposures.set(key,{user_id:u.id,t:e.t,p})}
  }
  const page=es.find(e=>e.type==='page_view')
  const valid=analysisRows.filter(r=>r.user_id===u.id&&r.state==='success'&&r.trigger==='user_action'&&r.finished_at!=null).map(r=>({t:r.finished_at,properties:{analysis_request_id:r.id}})).sort((a,b)=>a.t-b.t)
  for(const click of es.filter(e=>['token_click','callout_click'].includes(e.type)&&e.t>=start&&e.t<end)){
   const p=click.properties||{},visit=p.token_visit_id||click.token_visit_id
   if(!visit){missingVisitClicks++;continue}
   const chain=String(p.chain??click.chain??''),token=p.token_address??click.token_address
   const same=(props,event)=>String(props.token_visit_id??event?.token_visit_id??'')===String(visit)&&String(props.chain??event?.chain??'')===chain&&(props.token_address??event?.token_address)===token
   const detail=es.find(e=>e.type==='token'&&e.t>click.t&&e.t<click.t+conversionWindow&&same(e.properties||{},e))
   const completion=detail?analysisRows.find(r=>r.user_id===u.id&&r.state==='success'&&r.finished_at>detail.t&&r.finished_at<click.t+conversionWindow&&r.token_visit_id===String(visit)&&r.chain===chain&&r.token_address===token):null
   if(!entrances.some(r=>r.user_id===u.id&&r.visit===String(visit)))entrances.push({user_id:u.id,visit:String(visit),entry_module:p.entry_module||'unknown',list_type:p.list_type|| (click.type==='callout_click'?'callouts':'unknown'),detail:!!detail,success:!!completion,pending:asOf<click.t+conversionWindow})
  }
  if(page&&page.t>=start&&page.t<end){const first=valid.find(e=>e.t>=page.t&&e.t<page.t+conversionWindow),mature=asOf>=page.t+conversionWindow;cohorts.push({user_id:u.id,t:page.t,success_at:first?.t??null,mature,state:first?'converted':!mature?'pending':'unobserved'})}
  const first=valid[0];if(first&&first.t>=start&&first.t<end){prior.push({user_id:u.id,t:first.t,days:new Set(valid.map(e=>day(e.t)))})}
 }
 for(const u of users)for(const e of u.events){if(e.t>asOf||!['token_click','callout_click'].includes(e.type))continue;const p=e.properties||{},key=JSON.stringify([u.id,p.page_visit_id,p.item_exposure_id]),exposure=exposures.get(key)
  if(exposure&&e.t>=exposure.t&&e.t<exposure.t+conversionWindow){clicked.add(key);clickedUsers.add(u.id)}else if(e.t>=start&&e.t<end)unmatchedClicks++
 }
 for(const x of exposures.values())exposedUsers.add(x.user_id)
 const entered=cohorts.filter(c=>c.mature),converted=entered.filter(c=>c.state==='converted'),latencies=converted.map(c=>c.success_at-c.t)
 for(const state of ['converted','pending','unobserved'])lists['value:'+state]=cohorts.filter(c=>state==='pending'?!c.mature:c.mature&&c.state===state).map(c=>c.user_id)
 lists['exposure:all']=[...exposedUsers];lists['exposure:clicked']=[...clickedUsers]
 const entranceRows=[...new Set(entrances.map(x=>x.list_type))].map((value,i)=>{const ss=entrances.filter(x=>x.list_type===value),key='entrance:'+i;lists[key]=[...new Set(ss.map(x=>x.user_id))];lists[key+':success']=[...new Set(ss.filter(x=>x.success).map(x=>x.user_id))];return {value,visits:ss.length,details:ss.filter(x=>x.detail).length,successes:ss.filter(x=>x.success).length,pending:ss.filter(x=>x.pending).length,rate:ss.length?ss.filter(x=>x.success).length/ss.length:null,list_key:key}})
 const retention=[1,7].map(d=>{const eligible=prior.filter(c=>day(asOf)>day(c.t)+d),returned=eligible.filter(c=>c.days.has(day(c.t)+d));lists['value:d'+d+':eligible']=eligible.map(c=>c.user_id);lists['value:d'+d+':returned']=returned.map(c=>c.user_id);return {day:d,eligible:eligible.length,returned:returned.length,rate:eligible.length?returned.length/eligible.length:null,pending:prior.length-eligible.length}})
 const dimensions=['entry_module','list_type'].map(dim=>({dimension:dim,rows:[...new Set([...exposures.values()].map(x=>x.p[dim]||'unknown'))].map(value=>{const keys=[...exposures].filter(([,x])=>(x.p[dim]||'unknown')===value).map(([k])=>k);return {value,exposures:keys.length,clicked:keys.filter(k=>clicked.has(k)).length,rate:keys.length?keys.filter(k=>clicked.has(k)).length/keys.length:null}})}))
 return {lists,payload:{page_clicks:pageClicks.payload,entrance:{rows:entranceRows,missing_visit_clicks:missingVisitClicks,completion_available:analysisObserved},exposure:{available:exposureObserved,exposures:exposures.size,clicked:clicked.size,exposed_users:exposedUsers.size,clicked_users:clickedUsers.size,rate:exposures.size?clicked.size/exposures.size:null,unmatched_clicks:unmatchedClicks,dimensions},first_value:{available:analysisObserved,entered:cohorts.length,eligible:entered.length,converted:converted.length,pending:cohorts.filter(c=>!c.mature).length,unobserved:cohorts.filter(c=>c.state==='unobserved').length,rate:analysisObserved&&entered.length?converted.length/entered.length:null,median_ms:percentile(latencies,.5),p90_ms:percentile(latencies,.9),window_ms:conversionWindow},retention,coverage:'partial',definition:'首次访问/分析均为已观测历史首次；24小时转化窗口，未成熟单列。D1/D7按UTC+7完整自然日成熟；历史与采集覆盖未确认，未观测不能证明未使用。卡片按曝光ID和页面关联，点击观察窗口24小时。'}}
}
module.exports={valueDiagnostics}
