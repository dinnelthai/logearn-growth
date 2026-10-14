// Compact internal cache representation; API rows retain their named fields.
function compactDetails(result){
 const tagDictionary=[],tagIndex=new Map()
 const details=Object.fromEntries(Object.entries(result.details).map(([id,row])=>{
  if(!Array.isArray(row.operational_tags))return [id,row]
  const indices=row.operational_tags.map(tag=>{if(!tagIndex.has(tag.id)){tagIndex.set(tag.id,tagDictionary.length);tagDictionary.push(tag)}return tagIndex.get(tag.id)})
  return [id,{...row,operational_tags:indices}]
 }))
 const fields=[...new Set(Object.values(details).flatMap(r=>Object.keys(r)))]
 return {...result,...(tagDictionary.length?{operational_tag_dictionary:tagDictionary}:{}),detail_fields:fields,details:Object.fromEntries(Object.entries(details).map(([id,r])=>[id,fields.map(k=>r[k]??null)]))}
}
function expandDetails(value,id){const r=value.details?.[id];if(!r)return {};const row=value.detail_fields?Object.fromEntries(value.detail_fields.map((k,i)=>[k,r[i]])):r;return value.operational_tag_dictionary&&Array.isArray(row.operational_tags)?{...row,operational_tags:row.operational_tags.map(i=>value.operational_tag_dictionary[i])}:row}
module.exports={compactDetails,expandDetails}
