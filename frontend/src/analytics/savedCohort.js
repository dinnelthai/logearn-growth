import {getCohort,saveCohortVersion} from './cohortClient.js'
import {fetchBackendMeta} from '../api/backendAnalytics.js'
import {fetchSegmentsMetrics} from '../api/metrics.js'
import {materializeAudience} from '../api/drill.js'
export function dynamicRule({applied,config,audience}){
 const selection=audience?.selection,isTags=selection?.kind==='tags'
 return {version:1,days:applied.days,pool:applied.pool,filters:{...applied.filters},source:config.source||'all',tag_ids:isTags?selection.tagIds:[],tag_mode:isTags?selection.mode:'all',base_ids:isTags?(audience.base?.ids??selection.base?.ids??null):(audience?.ids??config.audienceIds??null)}
}
export async function resolveSavedCohort(id,context,meta){
 const [c,m]=await Promise.all([getCohort(id),meta?Promise.resolve(meta):fetchBackendMeta()])
 let ids,start=context.start,end=context.end,source=context.source||'all',snapshot_id=m.snapshot_id,as_of=m.as_of
 if(c.kind==='dynamic'){
  const r=c.rule
  const asof=Number(m.asOf)||Date.parse(m.as_of);if(!Number.isFinite(asof))throw Error('数据快照时间无效')
  end=asof+1;start=Math.floor((end+25200000)/86400000)*86400000-25200000-(r.days-1)*86400000;source=r.source
  const result=await fetchSegmentsMetrics({resolving_cohort_id:id,start,end,source,snapshot_id,filters:r.filters,pool:r.pool,group_by:'signal',audience_ids:r.base_ids,tag_ids:r.tag_ids,tag_mode:r.tag_mode})
  await saveCohortVersion(id,result.drill.cache_id)
  if(result.total===0)ids=[]
  else {const a=await materializeAudience({cache_id:result.drill.cache_id,list_key:'all'});ids=a.ids;snapshot_id=a.snapshot_id;as_of=a.as_of}
 }else ids=[...new Set((c.user_ids||[]).map(id=>id.startsWith('anonymous:')?id:'user:'+id.replace(/^user:/,'')))]
 return {ids,count:ids.length,title:c.name,description:c.kind==='dynamic'?'动态条件计算后的固定名单':'保存的固定用户名单',start,end,source,snapshot_id,as_of,origin:'cohort',selection:{kind:'cohort',id},fixed_at:new Date().toISOString()}
}
