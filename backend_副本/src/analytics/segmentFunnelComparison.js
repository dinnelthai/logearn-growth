const {computeFunnel,ASSOCIATIONS}=require('./funnel')
const PRESETS={
 analysis:{label:'登录后分析',steps:['logged_in_visit','token','chip']},
 ai:{label:'策略后分析',steps:['token','ai','chip']},
 token_visit:{label:'同次Token访问',steps:['token_click','token','chip'],association:'token_visit'},
 strategy_run:{label:'同次策略运行',steps:['ai','strategy_result','signal_view'],association:'strategy_run'},
}
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
function options(body){
 const preset=body.preset??'analysis',hours=Number(body.hours??24)
 if(!Object.hasOwn(PRESETS,preset))fail('未知对比漏斗')
 const association=body.association??PRESETS[preset].association??'user'
 if(!Object.hasOwn(ASSOCIATIONS,association)||![1,24,72].includes(hours))fail('无效关联模式或转化窗口')
 if(association!=='user'&&association!==PRESETS[preset].association)fail('所选漏斗不支持该业务关联模式')
 return {preset,hours,association,steps:PRESETS[preset].steps}
}
function prepareComparison(body,job,value){
 const config=options(body),keys=body.group_keys
 if(job.context.mode!=='segments')fail('请先运行用户分群')
 if(!Array.isArray(keys)||keys.length<2||keys.length>8||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)fail('请选择2至8个不同人群')
 const groups=keys.map(key=>{
  const group=value.payload.comparison?.find(g=>g.list_key===key),ids=value.lists?.[key]
  if(!group||!Array.isArray(ids))fail('人群不属于当前分群结果')
  if(ids.some(id=>typeof id!=='string'||!id.startsWith('user:')))fail('对比只支持注册用户名单')
  return {key,label:group.label,ids:[...new Set(ids)]}
 })
 const audience=[...new Set(groups.flatMap(g=>g.ids))]
 if(audience.length>5000)fail('对比名单合计最多5000人，请缩小分群',422)
 const {start,end}=value.payload
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start)fail('分群统计期无效，请重新运行',409)
 return {body:{...config,start,end,source:job.context.source||'all',groups,base_cache_id:job.id},audience}
}
function compareFunnels(users,body,snapshot){
 const lists={},byId=new Map(users.map(u=>[u.id,u])),asOf=Date.parse(snapshot.as_of)
 const groups=body.groups.map(group=>{
  const members=group.ids.map(id=>byId.get(id)).filter(Boolean)
  const result=computeFunnel(members,{steps:body.steps,startAt:body.start,endAt:body.end,asOf,conversionWindowMs:body.hours*3600000,association:body.association})
  const put=(suffix,ids)=>{const key=group.key+':'+suffix;lists[key]=[...new Set(ids)];return {count:lists[key].length,list_key:key}}
  const stages=body.steps.map((step,i)=>({step,
   reached:put('reached:'+i,result.rows.filter(r=>r.times.length>i).map(r=>r.userId)),
   unobserved:put('unobserved:'+i,i===body.steps.length-1?[]:result.rows.filter(r=>r.times.length===i+1&&!r.pending&&!r.dataIncomplete).map(r=>r.userId)),
   pending:put('pending:'+i,i===body.steps.length-1?[]:result.rows.filter(r=>r.times.length===i+1&&r.pending).map(r=>r.userId)),
  }))
  return {key:group.key,label:group.label,pool_users:group.ids.length,entered:result.total_entered,converted:result.total_converted,stages,
   missing_start:put('missing_start',result.quality.missingStartUserIds),incomplete:put('incomplete',result.quality.incompleteUserIds)}
 })
 return {lists,payload:{start:body.start,end:body.end,preset:body.preset,association:body.association,hours:body.hours,groups,
  pool_users:new Set(body.groups.flatMap(g=>g.ids)).size,user_pool:'registered',base_cache_id:body.base_cache_id,
  definition:'分组来自已运行分群的固定名单，按同一快照和统计期计算。各组可能重叠，人数不可相加；未观测后续不证明流失或因果。'}}
}
module.exports={PRESETS,options,prepareComparison,compareFunnels}
