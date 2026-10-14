const db=require('../db/connection')
function userTags(owner,{tagIds=null,userIds=null,includeMembers=true}={}) {
  let tags=db.prepare(`SELECT 'activity:'||a.id AS id,a.name,'activity' AS type,a.start_at AS version,
      (SELECT COUNT(*) FROM growth_activity_members WHERE activity_id=a.id) AS users FROM growth_activities a WHERE owner_id=?
    UNION ALL SELECT 'kol:'||k.id,k.name,'kol',k.updated_at,
      (SELECT COUNT(*) FROM (SELECT user_id FROM crm_kol_members WHERE kol_id=k.id UNION SELECT k.account_id WHERE k.account_id IS NOT NULL))
      FROM crm_kols k WHERE owner_id=?`).all(String(owner),String(owner))
  if(tagIds!==null){if(!Array.isArray(tagIds)||tagIds.some(id=>typeof id!=='string')||tagIds.length>20)throw Object.assign(new Error('标签筛选格式无效'),{status:400});for(const id of tagIds)if(!tags.some(t=>t.id===id))throw Object.assign(new Error('标签不存在或无权访问'),{status:404});tags=tags.filter(t=>tagIds.includes(t.id))}
  if(!includeMembers||!tags.length)return tags
  const params={$owner:String(owner),$tags:JSON.stringify(tags.map(t=>t.id)),$users:userIds===null?null:JSON.stringify(userIds)}
  const rows=db.prepare(`SELECT 'activity:'||a.id AS tag_id,'user:'||m.user_id AS user_id FROM growth_activities a JOIN growth_activity_members m ON m.activity_id=a.id
      WHERE a.owner_id=$owner AND 'activity:'||a.id IN(SELECT value FROM json_each($tags)) AND ($users IS NULL OR 'user:'||m.user_id IN(SELECT value FROM json_each($users)))
    UNION SELECT 'kol:'||k.id,'user:'||k.account_id FROM crm_kols k WHERE k.owner_id=$owner AND k.account_id IS NOT NULL
      AND 'kol:'||k.id IN(SELECT value FROM json_each($tags)) AND ($users IS NULL OR 'user:'||k.account_id IN(SELECT value FROM json_each($users)))
    UNION SELECT 'kol:'||k.id,'user:'||m.user_id FROM crm_kols k JOIN crm_kol_members m ON m.kol_id=k.id
      WHERE k.owner_id=$owner AND 'kol:'||k.id IN(SELECT value FROM json_each($tags)) AND ($users IS NULL OR 'user:'||m.user_id IN(SELECT value FROM json_each($users)))`).all(params)
  const members=new Map(tags.map(t=>[t.id,new Set()]))
  for(const row of rows)members.get(row.tag_id).add(row.user_id)
  return tags.map(t=>({...t,user_ids:[...members.get(t.id)]}))
}
function resolveTags(tags,ids=[],mode='any',audience=null) {
  if(!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=='string')||!['any','all'].includes(mode))throw Object.assign(new Error('标签筛选格式无效，最多20个标签'),{status:400})
  const selected=[...new Set(ids)].map(id=>{const tag=tags.find(t=>t.id===id);if(!tag)throw Object.assign(new Error('标签不存在或无权访问'),{status:404});return tag})
  if(!selected.length)return audience
  let result=new Set(selected[0].user_ids)
  for(const tag of selected.slice(1)){const ids=new Set(tag.user_ids);result=mode==='all'?new Set([...result].filter(id=>ids.has(id))):new Set([...result,...ids])}
  if(audience!==null){const ids=new Set(audience);result=new Set([...result].filter(id=>ids.has(id)))}
  if(result.size>50000)throw Object.assign(new Error('标签人群超过50000人，请缩小范围'),{status:422})
  return [...result]
}
module.exports={userTags,resolveTags}
