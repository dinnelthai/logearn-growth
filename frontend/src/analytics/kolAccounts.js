export function kolAccountIds(kol){
 const raw=Array.isArray(kol.account_ids)?kol.account_ids:typeof kol.account_ids==='string'?kol.account_ids.split(/[\s,;，；]+/).filter(Boolean):kol.account_id?[kol.account_id]:[]
 return [...new Set(raw.map(id=>String(id).trim().replace(/^user:/,'')))]
}
export function kolProfileBody(values){const value={...values,account_ids:kolAccountIds(values)};delete value.account_id;return value}
