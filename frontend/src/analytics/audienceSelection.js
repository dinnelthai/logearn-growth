// A tag filter replaces its predecessor over the original base audience.
export function audienceBase(audience){return audience?.selection?.kind==='tags'?audience.selection.base:audience}
export function tagSelectionRequest(config,audience,tagIds,mode='all',intersect=false){
 const base=intersect?audience:audienceBase(audience)
 return {base:base||null,body:{tag_ids:tagIds,tag_mode:mode,start:config.start,end:config.end,source:base?.source||config.source||'all',audience_ids:base?.ids??null,cohort_id:base?.cohortId??null}}
}
export function selectedTagAudience(value,base,tagIds,mode){
 return {...value,description:value.description+(base?' · 基础人群：'+base.title:' · 基础人群：全部注册用户'),selection:{kind:'tags',base,tagIds:[...tagIds],mode},fixed_at:new Date().toISOString()}
}
export function renewedAudience(audience,meta){
 if(!meta.snapshot_id||!Number.isFinite(Date.parse(meta.as_of)))throw Error('新的数据快照无效')
 const base=audience?.selection?.base
 return {...audience,ids:[...audience.ids],snapshot_id:meta.snapshot_id,as_of:meta.as_of,renewed_at:new Date().toISOString(),...(audience.selection?{selection:{...audience.selection,base:base?{...base,snapshot_id:meta.snapshot_id,as_of:meta.as_of}:null}}:{})}
}
