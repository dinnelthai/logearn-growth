// Compact internal cache representation; API rows retain their named fields.
function compactDetails(result){
 const fields=[...new Set(Object.values(result.details).flatMap(r=>Object.keys(r)))]
 return {...result,detail_fields:fields,details:Object.fromEntries(Object.entries(result.details).map(([id,r])=>[id,fields.map(k=>r[k]??null)]))}
}
function expandDetails(value,id){const r=value.details?.[id];return !r?{}:value.detail_fields?Object.fromEntries(value.detail_fields.map((k,i)=>[k,r[i]])):r}
module.exports={compactDetails,expandDetails}
