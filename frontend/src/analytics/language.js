/** Use declared product language; never infer language from acquisition or contacts. */
export function normalizeLanguage(value) {
 if(typeof value!=='string')return null
 const base=value.trim().toLowerCase().replace(/_/g,'-').split('-')[0]
 return ['zh','en'].includes(base)?base:null
}
export const languageLabel=value=>({zh:'中文用户',en:'英文用户'}[normalizeLanguage(value)]??'语言未知/其他')
