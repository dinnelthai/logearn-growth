'use strict';
// Agent-only facade: all authorization, query budgets and evidence storage
// still flow through the existing registry. Never run business SQL here.
const {forModel}=require('../modelEvidence');
const {SOURCE_CONTRACTS}=require('./sourceContracts');

const MODULES=Object.freeze([
 {moduleId:'growth.seo',version:'1.0.0',description:'GSC 聚合与可选第三方排名；不得推断 SEO 到注册因果归因',capabilities:['get_seo_performance','openseo.saved_rankings']},
 {moduleId:'growth.acquisition',version:'1.0.0',description:'渠道首次观测与激活；不能把首次观测当成注册',capabilities:['get_channels']},
 {moduleId:'growth.activation',version:'1.0.0',description:'顺序漏斗、路径与产品链，明确成熟度和事件覆盖',capabilities:['get_funnel','get_paths','get_product_chain']},
 {moduleId:'growth.retention',version:'1.0.0',description:'成熟留存、分群和既有北极星指标',capabilities:['get_retention','get_segments','query_metrics']},
 {moduleId:'growth.quality',version:'1.0.0',description:'数据质量与来源水位；不保证跨源一致',capabilities:['check_data_quality']},
 {moduleId:'growth.economics',version:'1.0.0',description:'合作账本成本和人工登记收支；非平台交易手续费或全平台收入，交易量不是收入',capabilities:['get_channel_economics']},
 {moduleId:'growth.referral',version:'1.0.0',description:'复用现有推荐绑定与邀请转化；绑定不等于注册',capabilities:['get_referral','get_invite_conversion']},
 {moduleId:'growth.login',version:'1.0.0',description:'复用现有登录转化与终态覆盖',capabilities:['get_login_conversion']},
 {moduleId:'growth.operations',version:'1.0.0',description:'只读回顾人工运营、渠道观测和AI建议；各来源独立并明确覆盖',capabilities:['get_operations_timeline']}
]);
const byModule=new Map(MODULES.map(m=>[m.moduleId,m]));
const globalOnly=new Set(['check_data_quality','get_channel_economics','get_seo_performance',
 'get_kol_performance','get_content_growth','get_follower_quality','get_operations_timeline']);
const FUNNEL_STEPS=Object.freeze(['token','chip','drill','ai','trade','logged_in_visit','login','visit']);
const validFields=new Set(['scope','start','end','metrics','dimensions','filters','steps',
 'hours','initial','returning','limit','cursor','siteUrl']);
const permittedFields=id=>new Set(['scope','start','end','filters','limit','cursor',
 ...(id==='get_funnel'?['steps','hours']:id==='get_retention'?['initial','returning']:
 id==='query_metrics'?['metrics','dimensions']:id==='get_seo_performance'?['siteUrl']:['get_login_conversion','get_invite_conversion'].includes(id)?['hours']:[])]);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
function validateInput(id,input){
 if(!plain(input))fail('input 必须是普通对象');
 const allowed=permittedFields(id);
 for(const key of Object.keys(input))if(!validFields.has(key)||!allowed.has(key))
  fail('不支持输入字段 '+key+'；允许字段：'+[...allowed].join(', '));
 if(input.filters!==undefined){
  if(!plain(input.filters))fail('filters 必须是对象；来源请用 scope.source');
  if(Object.keys(input.filters).length)
   fail('filters 不支持自定义筛选；来源请用 scope.source，例如 {"scope":{"source":"direct"}}');
 }
 if(input.scope!==undefined){
  if(!plain(input.scope)||Object.keys(input.scope).some(k=>!['source','activityId','cohortId'].includes(k)))
   fail('scope 仅支持 source、activityId、cohortId');
  for(const value of Object.values(input.scope))
   if(typeof value!=='string'||!value.trim()||value.length>200)
    fail('scope 的取值必须是 1–200 字符的非空字符串');
 }
 if(input.steps!==undefined&&(!Array.isArray(input.steps)||input.steps.length<2||
    input.steps.length>8||input.steps.some(s=>!FUNNEL_STEPS.includes(s))))
  fail('漏斗步骤必须为 2–8 项；允许：'+FUNNEL_STEPS.join(', '));
 if(input.hours!==undefined&&(!Number.isSafeInteger(input.hours)||input.hours<1||input.hours>168))
  fail('hours 必须是 1–168 的整数');
 for(const k of ['start','end'])if(input[k]!==undefined&&!Number.isSafeInteger(input[k]))
  fail(k+' 必须为整数时间戳');
 if(input.limit!==undefined&&(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100))
  fail('limit 必须是 1–100 的整数');
 if(input.siteUrl!==undefined&&(typeof input.siteUrl!=='string'||input.siteUrl.length>1000))
  fail('siteUrl 必须为不超过 1000 字符的字符串');
 if(Buffer.byteLength(JSON.stringify(input),'utf8')>8192)fail('输入超过 8 KB 上限');
 // The legacy registry checks period, metric IDs, ownership, scope and budget again.
}
function statusFor(result){
 if(result?.status==='not_configured')return 'not_configured';
 if(result?.status==='no_data')return 'no_data';
 if(result?.status!=='ok')return 'unavailable';
 const rows=Array.isArray(result.evidence)?result.evidence:[];
 if(rows.length&&rows.every(e=>e?.value?.available===false)){
  // Not synced or unknown coverage is NOT an observed zero or empty dataset.
  const states=rows.map(e=>e?.value?.dataState||e?.value?.coverage?.status||'unknown');
  return states.every(s=>s==='no_data'||s==='observed_empty')?'no_data':'unavailable';
 }
 return 'ok';
}
function sourceType(e,id){
 if(e?.external?.sourceType)return e.external.sourceType;
 if(id==='get_seo_performance'){
  if(e?.value?.source==='gsc-api')return 'gsc_observation';
  if(e?.value?.source==='gsc-manual-export')return 'manual_search_observation';
  return 'search_source_unknown';
 }
 return SOURCE_CONTRACTS[id]?.sourceType||'source_unknown';
}
function listBusinessModules(registry,context){
 if(!context?.ownerId)fail('缺少认证所有者',403);
 const live=new Map(registry.listCapabilities(context).map(c=>[c.id,c]));
 return MODULES.map(m=>{
  const capabilities=m.capabilities.filter(id=>live.has(id)&&
   (!context.scope?.activityId||live.get(id).supportedScopes?.includes('activityId'))&&
   (!context.scope?.cohortId||live.get(id).supportedScopes?.includes('cohortId'))&&
   (!context.taskAllowedTools||context.taskAllowedTools.includes(id))&&
   (!context.scope?.source||context.scope.source==='all'||!globalOnly.has(id)))
   .map(id=>{const c=live.get(id);return {
    id:c.id,version:c.version||'1',description:c.description,
    supportedScopes:c.supportedScopes,permission:c.permission,cost:c.cost||'none',
    inputSchema:c.inputSchema,
    sourceContract:SOURCE_CONTRACTS[id]||null
   };});
  return {moduleId:m.moduleId,version:m.version,description:m.description,
   status:capabilities.length?'available':'unavailable',capabilities};
 });
}
async function executeBusinessModule(registry,{moduleId,capabilityId,input={}},context){
 if(!context?.ownerId)fail('缺少认证所有者',403);
 const module=byModule.get(moduleId);
 if(!module)fail('未知模块');
 const selected=listBusinessModules(registry,context).find(m=>m.moduleId===moduleId);
 const capability=selected.capabilities.find(c=>c.id===capabilityId);
 if(!capability)fail('该模块能力不可用、未授权或不在当前任务范围',403);
 if(capabilityId==='openseo.saved_rankings'){
  if(!plain(input))fail('连接器参数必须是普通对象');
  // External connector already owns its strict schema and authorization.
 }else validateInput(capabilityId,input);
 let result;
 try{result=await registry.executeTool(capabilityId,input,context);}
 catch(error){
  if([400,403,404,422,429].includes(error.status))throw error;
  throw Object.assign(Error('模块数据暂时不可用'),{status:503});
 }
 const status=statusFor(result);
 const evidence=Array.isArray(result?.evidence)?result.evidence:[];
 if(status==='ok'&&!evidence.length)fail('模块成功但缺少有效证据',502);
 // Existing positive allowlist strips user/event details before model access.
 const projected=forModel({...result,status:status==='ok'?'ok':'unavailable'});
 const sourceScope=input.scope||context.scope||{};
 return {status,moduleId,moduleVersion:module.version,
  capabilityId,capabilityVersion:capability.version,
  request:{period:context.period,scope:{source:sourceScope.source||'all',
   fixedAudience:!!(sourceScope.activityId||sourceScope.cohortId)}},
  evidenceIds:evidence.map(e=>e?.id).filter(id=>typeof id==='string').slice(0,24),
  sources:[...new Set(evidence.map(e=>sourceType(e,capabilityId)))],
  sourceContract:SOURCE_CONTRACTS[capabilityId]||null,
  definitionVersions:[...new Set(evidence.map(e=>e?.definitionVersion).filter(Boolean))],
  coverage:projected.evidence?.[0]?.coverage||{status:'unknown'},
  watermarks:projected.evidence?.[0]?.watermarks||{},
  warnings:(projected.warnings||[]).slice(0,7),data:projected,
  unavailableReason:status==='no_data'?'该范围明确确认无观测':
   status==='unavailable'?'数据源未配置、未同步或上游不可用，不能记作0':null};
}
module.exports={listBusinessModules,executeBusinessModule,FUNNEL_STEPS,validateInput};
