const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function owner(context){if(!context?.ownerId)fail('缺少认证所有者',403);return String(context.ownerId);}
async function resolveScope(input={},context,lookups){
 const ownerId=owner(context);
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['source','activityId','cohortId'].includes(k)))fail('范围字段无效');
 const scope={source:input.source??context.scope?.source??'all'};
 for(const k of ['source','activityId','cohortId'])if(input[k]!=null){if(typeof input[k]!=='string'||!input[k].trim()||input[k].length>200)fail('范围格式无效');scope[k]=input[k];}
 const allowed=context.scope||{source:'all'};
 if(allowed.source&&allowed.source!=='all'&&scope.source!==allowed.source)fail('超出授权来源范围',403);
 for(const key of ['activityId','cohortId'])if(allowed[key]&&scope[key]!==allowed[key])fail('超出授权人群范围',403);
 let audience=null;
 for(const [key,lookup] of [['activityId','activity'],['cohortId','cohort']])if(scope[key]){
  const record=await lookups?.[lookup]?.(scope[key],ownerId);
  if(!record)fail('范围不存在或无权限',404);if(!record.fixed)fail('必须使用已固定名单',409);
  const ids=[...new Set(record.ids.map(id=>String(id).replace(/^user:/,'')))];
  audience=audience===null?ids:audience.filter(id=>ids.includes(id));
 }
 return {scope,audience};
}
function sqliteLookups(db){return {
 activity:async(id,ownerId)=>{
  const a=db.prepare('SELECT id,schedule_state FROM growth_activities WHERE id=? AND owner_id=?').get(id,ownerId);
  return a?{fixed:a.schedule_state!=='scheduled',ids:db.prepare('SELECT user_id FROM growth_activity_members WHERE activity_id=?').all(id).map(r=>r.user_id)}:null;
 },
 cohort:async(id,ownerId)=>{
  const c=db.prepare('SELECT id,kind FROM cohorts WHERE id=? AND created_by=? AND is_deleted=0').get(id,ownerId);
  return c?{fixed:c.kind!=='dynamic',ids:db.prepare('SELECT user_id FROM cohort_members WHERE cohort_id=?').all(id).map(r=>r.user_id)}:null;
 }
};}
module.exports={resolveScope,sqliteLookups,owner};
