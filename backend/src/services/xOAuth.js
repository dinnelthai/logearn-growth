'use strict';
// X account authorization only. No publishing or metrics ingestion happens here.
const {randomBytes,createHash,createCipheriv,createDecipheriv}=require('node:crypto');
const sqlite=require('../db/connection');
const SCOPES='tweet.read users.read offline.access';
const TOKEN_URL='https://api.x.com/2/oauth2/token';
const PROFILE_URL='https://api.x.com/2/users/me?user.fields=profile_image_url';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const hash=value=>createHash('sha256').update(value).digest('hex');

function config(env=process.env){
 const {X_CLIENT_ID:clientId,X_CLIENT_SECRET:clientSecret,X_REDIRECT_URI:redirectUri,
  X_FRONTEND_ORIGIN:frontendOrigin,X_OAUTH_ENCRYPTION_KEY:rawKey}=env;
 if(!clientId||!clientSecret||!redirectUri||!frontendOrigin||!rawKey)
  fail('请配置 X_CLIENT_ID、X_CLIENT_SECRET、X_REDIRECT_URI、X_FRONTEND_ORIGIN 和 X_OAUTH_ENCRYPTION_KEY',503);
 let callback,frontend;
 try{callback=new URL(redirectUri);frontend=new URL(frontendOrigin)}
 catch{fail('X OAuth 地址配置无效',503)}
 const local=url=>['localhost','127.0.0.1'].includes(url.hostname);
 if(callback.pathname!=='/api/x/oauth/callback'||callback.search||callback.hash||
  !['http:','https:'].includes(callback.protocol)||
  (callback.protocol!=='https:'&&!local(callback))||
  frontend.origin!==frontendOrigin||frontend.pathname!=='/'||frontend.search||frontend.hash||
  !['http:','https:'].includes(frontend.protocol)||
  (frontend.protocol!=='https:'&&!local(frontend)))
  fail('X OAuth 回调与前端来源必须为 HTTPS（本地 localhost 可用 HTTP）',503);
 if(!/^[0-9a-f]{64}$/i.test(rawKey))
  fail('X_OAUTH_ENCRYPTION_KEY 必须是32字节（64位十六进制）',503);
 return {clientId,clientSecret,redirectUri,frontendOrigin,key:Buffer.from(rawKey,'hex')};
}
function encrypt(value,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),ciphertext].map(part=>part.toString('base64url')).join('.');
}
function decrypt(value,key){
 try{
  const [iv,tag,data]=value.split('.');
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
  cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');
 }catch{fail('X 凭据无法解密，请重新授权',503)}
}
function createXOAuth({db=sqlite,env=process.env,request=fetch,clock=Date.now}={}){
 const configured=()=>{try{config(env);return true}catch{return false}};
 function status(ownerId){
  const row=db.prepare('SELECT x_user_id,username,display_name,profile_image_url,connected_at FROM x_oauth_connections WHERE owner_id=?').get(String(ownerId));
  return {configured:configured(),connected:!!row,
   account:row?{id:row.x_user_id,username:row.username,name:row.display_name,
    profileImageUrl:row.profile_image_url,connectedAt:row.connected_at}:null};
 }
 function start(ownerId){
  if(!ownerId)fail('未登录',401);
  const c=config(env),state=randomBytes(32).toString('base64url');
  const verifier=randomBytes(48).toString('base64url'),now=clock();
  db.prepare('DELETE FROM x_oauth_states WHERE owner_id=? OR expires_at<=?').run(String(ownerId),now);
  db.prepare('INSERT INTO x_oauth_states(state_hash,owner_id,code_verifier,expires_at) VALUES(?,?,?,?)')
   .run(hash(state),String(ownerId),verifier,now+10*60*1000);
  const url=new URL('https://x.com/i/oauth2/authorize');
  for(const [k,v] of Object.entries({
   response_type:'code',client_id:c.clientId,redirect_uri:c.redirectUri,scope:SCOPES,
   state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),
   code_challenge_method:'S256'
  }))url.searchParams.set(k,v);
  return {authorizationUrl:url.toString()};
 }
 async function complete(state,code){
  if(typeof state!=='string'||state.length<20||state.length>256||
   typeof code!=='string'||!code||code.length>4096)fail('X 授权回调参数无效');
  const saved=db.prepare('DELETE FROM x_oauth_states WHERE state_hash=? AND expires_at>? RETURNING owner_id,code_verifier')
   .get(hash(state),clock());
  if(!saved)fail('X 授权请求已过期或已使用，请重新授权');
  const c=config(env);
  let response,token;
  try{
   response=await request(TOKEN_URL,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',
     Authorization:'Basic '+Buffer.from(c.clientId+':'+c.clientSecret).toString('base64')},
    body:new URLSearchParams({grant_type:'authorization_code',code,
     redirect_uri:c.redirectUri,code_verifier:saved.code_verifier}),
    signal:AbortSignal.timeout(15000)
   });
   token=await response.json();
  }catch{fail('X 授权服务暂不可用，请重试',503)}
  if(!response.ok||typeof token?.access_token!=='string'||!token.access_token||
   typeof token?.refresh_token!=='string'||!token.refresh_token)
   fail('X 没有返回完整的访问与刷新令牌，请检查开发者应用权限',403);
  if(typeof token.scope==='string'&&SCOPES.split(' ').some(s=>!token.scope.split(' ').includes(s)))
   fail('X 未授予全部只读和离线授权范围',403);
  let profileResponse,profile;
  try{
   profileResponse=await request(PROFILE_URL,{
    headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)
   });
   profile=await profileResponse.json();
  }catch{fail('X 账号信息查询失败，请检查 API 访问额度',503)}
  if(!profileResponse.ok||typeof profile?.data?.id!=='string'||
   typeof profile?.data?.username!=='string')
   fail('无法确认 X 账号身份，请检查 X API 访问权限与额度',403);
  const account=profile.data,now=clock(),expires=Math.max(60,Math.min(86400,Number(token.expires_in)||7200));
  db.prepare('INSERT INTO x_oauth_connections(owner_id,x_user_id,username,display_name,profile_image_url,access_token_enc,refresh_token_enc,expires_at,connected_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET x_user_id=excluded.x_user_id,username=excluded.username,display_name=excluded.display_name,profile_image_url=excluded.profile_image_url,access_token_enc=excluded.access_token_enc,refresh_token_enc=excluded.refresh_token_enc,expires_at=excluded.expires_at,connected_at=excluded.connected_at')
   .run(saved.owner_id,account.id,account.username,String(account.name||''),String(account.profile_image_url||''),
    encrypt(token.access_token,c.key),encrypt(token.refresh_token,c.key),now+expires*1000,now);
  return {ownerId:saved.owner_id};
 }
 function disconnect(ownerId){
  db.prepare('DELETE FROM x_oauth_states WHERE owner_id=?').run(String(ownerId));
  db.prepare('DELETE FROM x_oauth_connections WHERE owner_id=?').run(String(ownerId));
  return {connected:false};
 }
 return {configured,status,start,complete,disconnect,frontendOrigin:()=>config(env).frontendOrigin};
}
const oauth=createXOAuth();
module.exports={createXOAuth,oauth,config,encrypt,decrypt,SCOPES};
