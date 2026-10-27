const contract=require('../../../frontend/src/analytics/trackingContract.json')
const fail=message=>{throw Object.assign(new Error(message),{status:400})}
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/
function normalizeAuditInput(input){
 const ids=input.event_ids??[],samples=input.samples??[]
 if(!Array.isArray(ids)||!Array.isArray(samples)||ids.length>100||samples.length>100)fail('每次最多核验100个event_id')
 const byId=new Map()
 const eventId=v=>{if(typeof v!=='string'||!ID.test(v))fail('event_id须为1–128位字母、数字或_.:-');return v}
 for(const raw of samples){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('浏览器样本须为事件对象')
  const sample={event_id:eventId(raw.event_id)}
  if(raw.event_name!==undefined){if(typeof raw.event_name!=='string'||!raw.event_name||raw.event_name.length>128)fail('样本event_name格式无效');sample.event_name=raw.event_name}
  if(raw.client_ts!==undefined){if(!Number.isSafeInteger(raw.client_ts))fail('样本client_ts须为毫秒整数');sample.client_ts=raw.client_ts}
  if(raw.properties!==undefined){
   if(!raw.properties||typeof raw.properties!=='object'||Array.isArray(raw.properties))fail('样本properties须为对象')
   sample.properties={}
   for(const key of contract.properties)if(Object.hasOwn(raw.properties,key)){
    const value=raw.properties[key]
    if(value!==null&&!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&value.length>512||typeof value==='number'&&!Number.isFinite(value))fail('仅接收白名单中的短文本、数值或布尔值')
    sample.properties[key]=value
   }
  }
  if(byId.has(sample.event_id)&&JSON.stringify(byId.get(sample.event_id))!==JSON.stringify(sample))fail('同一event_id的浏览器样本不一致，请核对后重试')
  byId.set(sample.event_id,sample)
 }
 const event_ids=[...new Set([...ids.map(eventId),...byId.keys()])]
 if(event_ids.length>100)fail('每次最多核验100个event_id')
 const status=input.collector_status??null
 if(status!==null&&(!Number.isInteger(status)||status<100||status>599))fail('采集HTTP状态须为100–599的整数')
 return {event_ids,samples:[...byId.values()],browser_confirmed:input.browser_confirmed===true,collector_status:status,collector_business_success:input.collector_business_success===true}
}
function contractIssues(event){
 const spec=Object.hasOwn(contract.events,event.event_name)?contract.events[event.event_name]:null,p=event.properties||{},issues=[]
 if(event.client_ts==null||!Number.isSafeInteger(Number(event.client_ts))||Number(event.client_ts)<0)issues.push('客户端时间无效')
 if(!spec)return {defined:false,issues}
 for(const key of spec.required)if(p[key]==null||typeof p[key]==='string'&&!p[key].trim())issues.push('缺少 '+key)
 for(const [key,values]of Object.entries(spec.enums||{}))if(p[key]!=null&&!values.includes(p[key]))issues.push(key+' 枚举不在约定范围')
 for(const [key,value]of Object.entries(p)){
  if(value==null)continue
  if(key==='duration_ms'){if(typeof value!=='number'||!Number.isFinite(value)||value<0)issues.push('duration_ms须为有限非负数')}
  else if(key==='cache_hit'){if(typeof value!=='boolean')issues.push('cache_hit须为布尔值')}
  else if(key==='chain'&&Number.isSafeInteger(value)&&value>0)continue
  else if(typeof value!=='string'||!value.trim()||value.length>512)issues.push(key+'须为非空短文本')
 }
 if(p.outcome==='failed')for(const key of ['error_stage','error_code'])if(typeof p[key]!=='string'||!p[key].trim())issues.push('明确失败缺少 '+key)
 if(p.outcome==='cancelled'&&(typeof p.cancel_reason!=='string'||!p.cancel_reason.trim()))issues.push('明确取消缺少 cancel_reason')
 return {defined:true,issues:[...new Set(issues)]}
}
function sampleDifferences(actual,sample){
 if(!sample)return []
 const differences=[]
 for(const field of ['event_name','client_ts'])if(Object.hasOwn(sample,field)&&sample[field]!==actual[field])differences.push(field)
 for(const [key,value]of Object.entries(sample.properties||{}))if(JSON.stringify(value)!==JSON.stringify(actual.properties?.[key]??null))differences.push('properties.'+key)
 return differences
}
function trackingAudit(rawRows,acceptedRows,summary,input,s){
 const normalized=normalizeAuditInput(input),accepted=new Map(acceptedRows.map(r=>[r.event_id,r])),samples=new Map(normalized.samples.map(r=>[r.event_id,r])),groups=new Map()
 for(const row of rawRows){if(!groups.has(row.event_id))groups.set(row.event_id,[]);groups.get(row.event_id).push(row)}
 const rows=normalized.event_ids.map(id=>{
  const raw=groups.get(id)||[],chosen=accepted.get(id)||raw[0],sample=samples.get(id)
  const fingerprints=new Set(raw.map(r=>JSON.stringify([r.event_name,Number(r.client_ts),r.identity_fingerprint,Object.keys(r.properties||{}).sort().map(k=>[k,r.properties[k]])])))
  const publicFingerprint=r=>JSON.stringify([r.event_name,Number(r.client_ts),Object.keys(r.properties||{}).sort().map(k=>[k,r.properties[k]])])
  const readConflict=accepted.has(id)&&(!raw.length||!raw.some(r=>publicFingerprint(r)===publicFingerprint(chosen)))
  const schema=chosen?contractIssues(chosen):{defined:false,issues:[]}
  const differences=chosen?sampleDifferences({...chosen,client_ts:Number(chosen.client_ts)},sample):[]
  const state=readConflict?'read_conflict':!raw.length?'not_found':fingerprints.size>1?'duplicate_conflict':!accepted.has(id)?'excluded':schema.issues.length?'schema_issue':differences.length?'sample_mismatch':schema.defined?'consistent':'legacy'
  const browser=normalized.browser_confirmed?'manually_reported':'not_provided'
  const http=normalized.collector_status,business=normalized.collector_business_success
  const linked=state==='consistent'&&!!sample&&Object.hasOwn(sample,'event_name')&&Object.hasOwn(sample,'client_ts')&&normalized.browser_confirmed&&http>=200&&http<300&&business
  return {event_id:id,event_name:chosen?.event_name||sample?.event_name||null,state,raw_records:raw.length,included:accepted.has(id),
   client_ts:chosen?.client_ts==null?null:Number(chosen.client_ts),server_ts:chosen?.server_ts||null,diagnostics_version:typeof chosen?.properties?.diagnostics_version==='string'?chosen.properties.diagnostics_version.slice(0,128):null,
   exclusions:[...new Set(raw.flatMap(r=>[r.invalid_client_time?'客户端时间无效或超出快照':null,r.missing_identity?'缺少账号与匿名身份':null,r.dirty_user?'命中脏账号标记':null]).filter(Boolean))],
   contract_defined:schema.defined,issues:[...schema.issues,...(readConflict?['两次数据库读取不一致，请用新快照重查']:[])],differences,
   browser_evidence:browser,sample_supplied:!!sample,collector_status:http,collector_business_success:business,
   evidence_state:linked?'sample_consistent':'incomplete',definition:'浏览器发出及采集响应是人工提供的证据；HTTP成功不证明业务成功或落库，样本一致不证明连续完整采集。'}
 })
 return {lists:{},payload:{start:input.start,end:Math.min(input.end,Date.parse(s.snapshot_cutoff)+1),requested_end:input.end,as_of:s.as_of,snapshot_cutoff:s.snapshot_cutoff,contract_version:contract.version,
  summary,rows,submitted_samples:normalized.samples,counts:{requested:rows.length,found:rows.filter(r=>r.raw_records>0).length,included:rows.filter(r=>r.included).length,sample_consistent:rows.filter(r=>r.evidence_state==='sample_consistent').length},
  metric_scope:'normalized_event_facts',continuous_coverage_confirmed:false,definition:'总览按服务端到达时间统计：到达记录=首次纳入代表事件+同ID其他到达+未纳入记录；诊断标记可重叠，不相加。纳入仅表示进入统一事件事实层，不保证计入某个业务指标。event_id在快照截止前全历史精确核验，不受所选到达窗口或来源筛选限制。没有真实浏览器请求样本时仅完成库侧检查，不声明端到端通过。'}}
}
module.exports={normalizeAuditInput,trackingAudit,contractIssues,sampleDifferences,contract}
