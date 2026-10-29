const {randomUUID,createHash}=require('node:crypto');
const {describeMetric}=require('./metricRegistry'),{owner}=require('./scope');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function authorize(e,context){if(e.ownerId!==owner(context))fail('证据不存在或无权限',404);const allowed=context.scope||{source:'all'},actual=e.filters.scope;
 if(allowed.source!=='all'&&allowed.source!==actual.source)fail('证据超出来源范围',403);
 for(const k of ['activityId','cohortId'])if(allowed[k]&&allowed[k]!==actual[k])fail('证据超出人群范围',403);
}
function makeEvidence(input,context){
 const ownerId=owner(context),metric=describeMetric(input.metricId),period=context.period;
 if(!period||!Number.isSafeInteger(period.start)||!Number.isSafeInteger(period.end)||period.start>=period.end||period.timezone!=='Asia/Bangkok')fail('证据期间无效');
 if(input.value!==null&&input.value!==undefined&&typeof input.value==='number'&&!Number.isFinite(input.value))fail('证据数值无效');
 if(input.denominator===0&&input.value!=null)fail('分母为0时数值必须未知');
 const query={metricId:metric.id,definitionVersion:metric.version,filters:{...(input.filters||{}),scope:context.scope||{source:'all'}},period,query:input.query||null};
 return JSON.parse(JSON.stringify({id:randomUUID(),ownerId,...query,unit:metric.unit,value:input.value??null,numerator:input.numerator??null,denominator:input.denominator??null,sampleSize:input.sampleSize??null,
 sourceVersions:input.sourceVersions||context.sourceVersions||{},watermarks:input.watermarks||{},coverage:input.coverage||{status:'unknown'},warnings:input.warnings||[],queryFingerprint:fingerprint(query),generatedAt:new Date().toISOString(),
 reportLocator:input.reportLocator||{page:'businessAnalysis',...period,scope:query.filters.scope},supersedesId:input.supersedesId||null}));
}
function createEvidenceStore(db){
 function save(e,context){authorize(e,context);const body=JSON.stringify(e),existing=db.prepare('SELECT body FROM agent_evidence WHERE id=?').get(e.id);if(existing){if(existing.body!==body)fail('证据档案不可变',409);return e;}db.prepare('INSERT INTO agent_evidence VALUES(?,?,?)').run(e.id,owner(context),body);return e;}
 function get(id,context){const row=db.prepare('SELECT body FROM agent_evidence WHERE id=? AND owner_id=?').get(id,owner(context));if(!row)fail('证据不存在或无权限',404);const e=JSON.parse(row.body);authorize(e,context);return e;}
 return {save,get};
}
function validateClaims(claims,context,store){
 if(!Array.isArray(claims))fail('结论必须为数组');
 return claims.map(c=>{
  if(!c.id||!['fact','hypothesis','recommendation'].includes(c.kind)||typeof c.text!=='string'||!c.text.trim()||!Array.isArray(c.evidenceIds)||!c.evidenceIds.length)fail('结论缺少证据或类型');
  const evidence=new Map(c.evidenceIds.map(id=>[id,store.get(id,context)]));
  for(const reference of c.values||[]){
   const e=evidence.get(reference.evidenceId);
   const path=reference.path||'value';
   // Only cite values the model was actually allowed to see; never traverse
   // unprojected event/member records or arbitrary array indices.
   if(!/^value(?:\.[a-zA-Z][a-zA-Z0-9_]{0,63}){0,5}$/.test(path))
    fail('结论 '+String(c.id).slice(0,40)+' 引用了不支持的证据字段路径');
   const projected=require('./modelTransport').modelEvidence(e);
   let actual=projected;
   for(const segment of path.split('.')){
    if(!actual||typeof actual!=='object'||Array.isArray(actual)||
     !Object.hasOwn(actual,segment)){actual=undefined;break;}
    actual=actual[segment];
   }
   if(typeof actual!=='number'||!Number.isFinite(actual)||!Object.is(actual,reference.value))
    fail('结论 '+String(c.id).slice(0,40)+' 的证据 '+String(reference.evidenceId).slice(0,40)+
     ' 字段 '+path+' 数值不匹配；请以已投影证据的数值和字段路径为准，不能猜测或代入缺失值');
  }
  return {...c,uncertainties:c.uncertainties||[],semanticStatus:'needs_evaluation',referenceStatus:'verified'};
 });
}
function reportEvidence(report,context,store){
 const entries=[];
 const base={sourceVersions:{events:report.snapshot.id},watermarks:{events:report.snapshot.asOf,eventsCompleteThrough:report.snapshot.eventsCompleteThrough,registrations:null,trades:null},coverage:{events:report.snapshot.historyComplete?'history_confirmed':'partial',registrations:'unknown',trades:'unknown'},warnings:report.warnings};
 const add=(input,period=context.period)=>{const e=makeEvidence({...base,...input},{...context,period});store.save(e,context);entries.push(e);};
 for(const [metricId,value]of Object.entries(report.current.totals))if(['active_users','new_users','returning_users'].includes(metricId))add({metricId,value});
 for(const [metricId,value]of Object.entries(report.previous.totals))if(['active_users','new_users','returning_users'].includes(metricId))add({metricId,value},{start:report.period.previousStart,end:report.period.previousEnd,timezone:'Asia/Bangkok'});
 for(const channel of report.growth.channels||[])for(const [metricId,numerator,denominator]of [['activation_rate',channel.activated,channel.eligible],['d7',channel.d7?.returned,channel.d7?.eligible]])add({metricId,value:denominator>0&&Number.isFinite(numerator)?numerator/denominator:null,numerator,denominator,sampleSize:denominator,filters:{source:channel.source},query:{channel:channel.source}});
 add({metricId:'weekly_core',value:report.weekly.available?report.weekly.users:null,warnings:[...base.warnings,...(!report.weekly.available?['weekly unavailable']:[])]});return entries;
}
module.exports={makeEvidence,createEvidenceStore,validateClaims,reportEvidence,fingerprint,authorize};
