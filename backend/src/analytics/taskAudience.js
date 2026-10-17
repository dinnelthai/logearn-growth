function cachedAudience(value,key,q=''){
 const ids=require('./retentionCurves').resolveCachedList(value,key);if(!Array.isArray(ids))throw Object.assign(new Error('未知用户名单'),{status:400})
 if(ids.some(id=>typeof id!=='string'||!(/^(user:|anonymous:).+$/).test(id)))throw Object.assign(new Error('该名单是记录或关系，请先选择用户指标'),{status:400})
 const search=String(q).slice(0,128).toLowerCase(),{expandDetails}=require('./compactDetails')
 const retentionSources=value.retention_store?new Map(value.retention_store.users.map(r=>[r[0],r[3]||'未知'])):null
 const filtered=ids.filter(id=>{const row=value.members?.[id]||(retentionSources?{id,source:retentionSources.get(id)}:{id,...expandDetails(value,id)});return !search||(value.members?(value.search_fields||['id','source']):['id','source']).some(k=>String(row[k]??'').toLowerCase().includes(search))})
 const result=[...new Set(filtered)];if(result.length>50000)throw Object.assign(new Error('用户名单超过50000人，请缩小筛选'),{status:422})
 if(!result.length)throw Object.assign(new Error('没有可继续分析的用户'),{status:400})
 return result
}
module.exports={cachedAudience}
