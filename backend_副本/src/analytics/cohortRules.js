const {validateOptions}=require('./segmentInsights')
const {userTags}=require('./userTags')
function validateRule(input,owner){
 const fail=message=>{throw Object.assign(new Error(message),{status:400})}
 if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1)fail('动态人群规则版本无效')
 const {days,pool='business',filters={},source='all',tag_ids=[],tag_mode='all',base_ids=null}=input
 if(!Number.isInteger(days)||days<1||days>366)fail('动态人群统计期须为1–366天')
 validateOptions({pool,filters})
 if(typeof source!=='string'||!source||source.length>128)fail('来源条件无效')
 if(!Array.isArray(tag_ids)||tag_ids.length>20||tag_ids.some(id=>typeof id!=='string')||!['all','any'].includes(tag_mode))fail('标签条件无效')
 const tags=[...new Set(tag_ids)]
 if(tags.length)userTags(owner,{tagIds:tags,includeMembers:false})
 if(base_ids!==null&&(!Array.isArray(base_ids)||base_ids.length>50000||base_ids.some(id=>typeof id!=='string'||!id||id.length>160)))fail('基础用户范围无效')
 return {version:1,days,pool,filters:{...filters},source,tag_ids:tags,tag_mode,base_ids:base_ids===null?null:[...new Set(base_ids)]}
}
function publicCohort(c){if(!c)return c;const {rule_json,...rest}=c;return {...rest,kind:c.kind||'static',...(c.kind==='dynamic'?{rule:JSON.parse(rule_json),member_count:null}:{})}}
module.exports={validateRule,publicCohort}
