'use strict';
// Google OAuth for the existing authenticated LogEarn user; credentials never go to the browser.
const {randomBytes,createHash,createCipheriv,createDecipheriv}=require('node:crypto');
const pool=require('../../db/aiPool');
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const sha=value=>createHash('sha256').update(value).digest('hex');
function config(env=process.env){
 const clientId=env.GOOGLE_CLIENT_ID,clientSecret=env.GOOGLE_CLIENT_SECRET;
 const redirectUri=env.GOOGLE_REDIRECT_URI,frontendOrigin=env.GSC_FRONTEND_ORIGIN;
 const rawKey=env.GSC_OAUTH_ENCRYPTION_KEY;
 if(!clientId||!clientSecret||!redirectUri||!frontendOrigin||!rawKey)
  fail('需要 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_REDIRECT_URI、GSC_FRONTEND_ORIGIN 和 GSC_OAUTH_ENCRYPTION_KEY',503);
 let callback,origin;
 try{callback=new URL(redirectUri);origin=new URL(frontendOrigin)}catch{fail('Google OAuth 回调或前端来源配置无效',503)}
 if(callback.pathname!=='/api/gsc/oauth/callback'||callback.search||callback.hash||
  !['http:','https:'].includes(callback.protocol)||
  (callback.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(callback.hostname))||
  origin.origin!==frontendOrigin||origin.pathname!=='/'||origin.search||origin.hash||
  (origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))
  fail('OAuth 回调或前端来源必须为 HTTPS（本地 localhost 可使用 HTTP）',503);
 if(!/^[a-f0-9]{64}$/i.test(rawKey))fail('GSC_OAUTH_ENCRYPTION_KEY 必须是32字节的64位十六进制密钥',503);
 return {clientId,clientSecret,redirectUri,frontendOrigin,key:Buffer.from(rawKey,'hex')};
}
function encrypt(token,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64url')).join('.');
}
function decrypt(value,key){
 try{
  const [a,b,c]=value.split('.');
  if(!a||!b||!c)throw Error('invalid');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(a,'base64url'));
  decipher.setAuthTag(Buffer.from(b,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(c,'base64url')),decipher.final()]).toString('utf8');
 }catch{fail('保存的 Google OAuth 凭据无法解密，请重新连接',503)}
}
function createGscOAuth({db=pool,env=process.env,request=fetch,clock=Date.now}={}){
 const cache=new Map(),pending=new Map();
 const available=()=>!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REDIRECT_URI&&
  env.GSC_FRONTEND_ORIGIN&&env.GSC_OAUTH_ENCRYPTION_KEY);
 const connected=async ownerId=>{
  if(!ownerId)return false;
  const r=await db.query('SELECT owner_id FROM ai_growth_gsc_oauth_connections WHERE owner_id=$1',[String(ownerId)]);
  return !!r.rows[0];
 };
 async function start(ownerId){
  if(!ownerId)fail('未登录',401);
  const c=config(env),state=randomBytes(32).toString('base64url');
  const verifier=randomBytes(32).toString('base64url');
  const now=clock();
  await db.query('DELETE FROM ai_growth_gsc_oauth_states WHERE owner_id=$1 OR expires_at<$2',
   [String(ownerId),now]);
  await db.query('INSERT INTO ai_growth_gsc_oauth_states(state_hash,owner_id,code_verifier,expires_at) VALUES($1,$2,$3,$4)',
   [sha(state),String(ownerId),verifier,now+600000]);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [k,v] of Object.entries({client_id:c.clientId,redirect_uri:c.redirectUri,
   response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',
   state,code_challenge:Buffer.from(createHash('sha256').update(verifier).digest()).toString('base64url'),
   code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return {authorizationUrl:url.toString()};
 }
 async function googleToken(body){
  let response;
  try{response=await request(TOKEN_URL,{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),
   signal:AbortSignal.timeout(12000)})}catch{fail('Google 授权服务暂不可用',503)}
  let value;try{value=await response.json()}catch{fail('Google 授权服务响应无效',503)}
  if(!response.ok||!value||typeof value.access_token!=='string')
   fail(value?.error==='invalid_grant'?'Google 授权已过期，请重新连接':'Google OAuth 获取令牌失败',403);
  return value;
 }
 async function complete(state,code){
  if(typeof state!=='string'||state.length>256||typeof code!=='string'||code.length>4096)
   fail('Google 授权回调参数无效',400);
  // Consume exactly once, across workers. A callback must never trust a browser-supplied user ID.
  const r=await db.query('DELETE FROM ai_growth_gsc_oauth_states WHERE state_hash=$1 AND expires_at>$2 RETURNING owner_id,code_verifier',
   [sha(state),clock()]);
  const row=r.rows[0];if(!row)fail('Google 授权已过期或已使用，请重新连接',400);
  const c=config(env);
  const result=await googleToken({code,code_verifier:row.code_verifier,client_id:c.clientId,
   client_secret:c.clientSecret,redirect_uri:c.redirectUri,grant_type:'authorization_code'});
  if(!result.scope?.split(/\s+/).includes(SCOPE))
   fail('Google 未授予 Search Console 只读权限',403);
  if(typeof result.refresh_token!=='string'||!result.refresh_token)
   fail('Google 未返回离线刷新令牌，请重新授权',403);
  await db.query('INSERT INTO ai_growth_gsc_oauth_connections(owner_id,refresh_token_enc,updated_at) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE SET refresh_token_enc=EXCLUDED.refresh_token_enc,updated_at=EXCLUDED.updated_at',
   [row.owner_id,encrypt(result.refresh_token,c.key),clock()]);
  // The previously selected property may belong to a different Google identity.
  await db.query('DELETE FROM ai_growth_gsc_settings WHERE owner_id=$1',[row.owner_id]);
  cache.delete(row.owner_id);
  return {ownerId:row.owner_id};
 }
 async function accessToken(ownerId){
  const id=String(ownerId);
  const saved=cache.get(id);
  if(saved&&saved.expires>clock()+60000)return saved.token;
  if(pending.has(id))return pending.get(id);
  const job=(async()=>{
   const r=await db.query('SELECT refresh_token_enc FROM ai_growth_gsc_oauth_connections WHERE owner_id=$1',[id]);
   if(!r.rows[0])fail('尚未连接 Google Search Console',409);
   const c=config(env);
   const refreshToken=decrypt(r.rows[0].refresh_token_enc,c.key);
   const result=await googleToken({client_id:c.clientId,client_secret:c.clientSecret,
    refresh_token:refreshToken,grant_type:'refresh_token'});
   cache.set(id,{token:result.access_token,expires:clock()+Math.min(3600,Math.max(60,Number(result.expires_in)||3600))*1000});
   return result.access_token;
  })();
  pending.set(id,job);
  try{return await job}finally{pending.delete(id)}
 }
 async function disconnect(ownerId){
  const id=String(ownerId);
  await db.query('DELETE FROM ai_growth_gsc_oauth_connections WHERE owner_id=$1',[id]);
  await db.query('DELETE FROM ai_growth_gsc_settings WHERE owner_id=$1',[id]);
  cache.delete(id);
  return {connected:false};
 }
 return {available,connected,start,complete,accessToken,disconnect,frontendOrigin:()=>config(env).frontendOrigin};
}
const oauth=createGscOAuth();
module.exports={createGscOAuth,oauth,config,encrypt,decrypt,SCOPE};
