const remote=require('./hologres')
const email=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const key=value=>email(value)?value.toLowerCase():/^0x[0-9a-fA-F]{40}$/.test(value)?value.toLowerCase():value
function parseAddresses(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>1024*1024)throw Object.assign(Error('地址名单须为文本，且不能超过1MB'),{status:400})
 const tokens=input.replace(/^\uFEFF/,'').split(/[\s,;，；]+/).map(x=>x.replace(/^"|"$/g,'')).filter(Boolean),addresses=[],invalid=[],seen=new Set();let duplicates=0
 if(tokens.length>10000)throw Object.assign(Error('每次最多输入10000条地址记录，请分批导入'),{status:422})
 for(const token of tokens){if(/^(address|wallet_address|login_address|地址|登录地址|平台地址|登陆地址|钱包地址|email|邮箱)$/i.test(token))continue
  if(!email(token)&&!/^0x[0-9a-fA-F]{40}$/.test(token)&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)){invalid.push(token);continue}
  const address=key(token);if(seen.has(address)){duplicates++;continue}seen.add(address);addresses.push(address)
 }
 if(addresses.length>5000)throw Object.assign(Error('每次最多识别5000个不同地址'),{status:422})
 if(!addresses.length)throw Object.assign(Error('请提供有效的邮箱、EVM 或 Solana 地址'),{status:400})
 return {addresses,invalid,duplicates}
}
function addressRosterSql(){return `WITH address_candidates AS (
 SELECT i.account_id,CASE WHEN i.subject ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(i.subject) ELSE i.subject END AS address,'login' AS source
 FROM public.account_identity_v2 i WHERE i.verified=true AND i.provider IN('metamask','phantom') AND i.created_at<=$1::timestamptz
 UNION ALL
 SELECT i.account_id,LOWER(i.subject) AS address,'email' AS source
 FROM public.account_identity_v2 i WHERE i.verified=true AND i.provider='email' AND i.created_at<=$1::timestamptz
 UNION ALL
 SELECT w.account_id,CASE WHEN w.address ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(w.address) ELSE w.address END AS address,'platform' AS source
 FROM public.wallet_v2 w WHERE w.status='active' AND w.created_at<=$1::timestamptz
 ) SELECT DISTINCT c.address,c.account_id::text AS user_id,c.source FROM address_candidates c
 JOIN public.account_v2 a ON a.account_id=c.account_id AND a.created_at<=$1::timestamptz
 WHERE c.address=ANY($2::text[]) LIMIT 20001`}
async function resolveAddresses(input){
 const parsed=parseAddresses(input),s=await remote.status(),rows=await remote.query(addressRosterSql(),[s.snapshot_cutoff,parsed.addresses])
 if(rows.length>20000)throw Object.assign(Error('地址匹配结果超过预算，请缩小名单'),{status:422})
 const matches=new Map()
 for(const row of rows){const address=key(row.address);if(!matches.has(address))matches.set(address,new Map());const accounts=matches.get(address),id=String(row.user_id);if(!accounts.has(id))accounts.set(id,new Set());accounts.get(id).add(row.source)}
 const records=parsed.addresses.map(address=>{const accounts=matches.get(address)||new Map();if(accounts.size!==1)return {address,state:accounts.size?'ambiguous':'unmatched',user_id:null,sources:[]};const [user_id,sources]=accounts.entries().next().value;return {address,state:'matched',user_id,sources:[...sources].sort()}})
 const user_ids=[...new Set(records.filter(r=>r.state==='matched').map(r=>r.user_id))]
 return {...parsed,records,user_ids,matched:records.filter(r=>r.state==='matched').length,unmatched:records.filter(r=>r.state==='unmatched').length,ambiguous:records.filter(r=>r.state==='ambiguous').length,users:user_ids.length,snapshot_id:s.snapshot_id,as_of:s.snapshot_cutoff}
}
module.exports={parseAddresses,addressRosterSql,resolveAddresses}
