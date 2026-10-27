function safeTarget(input){let u;try{u=new URL(input)}catch{throw Object.assign(new Error('推广目标地址无效'),{status:400})}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>1500)throw Object.assign(new Error('推广链接需为不含账号密码的HTTP地址'),{status:400});return u}
function promotionUrl(input,id,tags){const u=safeTarget(input);for(const key of ['utm_source','utm_medium','utm_campaign','utm_content']){const v=tags[key]||'';if(typeof v!=='string'||v.length>120||(['utm_source','utm_medium','utm_campaign'].includes(key)&&!v.trim()))throw Object.assign(new Error('请填写来源、媒介和活动参数（最多120字）'),{status:400});if(v.trim())u.searchParams.set(key,v.trim());else u.searchParams.delete(key)}u.searchParams.set('le_link',id);return u.href}
function attributeTouches(rows,links){
 const catalog=new Map(links.map(l=>[l.id,l])),first=new Map()
 for(const e of rows){let u;try{u=new URL(e.url)}catch{continue}const l=catalog.get(u.searchParams.get('le_link'));if(!l||Number(e.t)<l.created_at||!e.user_key)continue
  const target=new URL(l.url);if(u.origin!==target.origin||u.pathname!==target.pathname)continue
  const old=first.get(e.user_key);if(!old||Number(e.t)<old.t||Number(e.t)===old.t&&String(e.event_id)<old.event_id)first.set(e.user_key,{id:l.id,user_key:e.user_key,t:Number(e.t),event_id:String(e.event_id)})
 }
 return [...first.values()]
}
module.exports={promotionUrl,attributeTouches}
