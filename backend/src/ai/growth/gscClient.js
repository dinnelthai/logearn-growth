'use strict';
// Server-only, read-only Google Search Console API bridge.
// Never accept OAuth credentials or arbitrary remote URLs from the browser.
const {createSign}=require('node:crypto'),fs=require('node:fs');
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const API='https://www.googleapis.com/webmasters/v3';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function propertyName(input){
 if(typeof input!=='string'||!input||input.length>250)fail('Search Console 资源格式无效');
 if(input.startsWith('sc-domain:')){
  if(!/^sc-domain:[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(input))
   fail('Search Console 域名资源无效');
  return input.toLowerCase();
 }
 let url;try{url=new URL(input)}catch{fail('Search Console URL 资源无效')}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    !url.hostname.includes('.')||url.href!==input)fail('仅支持规范的 HTTPS Search Console URL 前缀资源');
 return input;
}
function authorizedProperties(ownerId,env=process.env){
 if(!ownerId)return [];
 let values;
 if(env.GSC_OWNER_SITES_JSON){
  let map;try{map=JSON.parse(env.GSC_OWNER_SITES_JSON)}catch{fail('GSC_OWNER_SITES_JSON 配置无效',503)}
  values=map?.[String(ownerId)];
 }else if(env.GSC_OWNER_ID===String(ownerId)){
  values=String(env.GSC_ALLOWED_SITES||'').split(',').map(x=>x.trim()).filter(Boolean);
 }
 if(!Array.isArray(values)||values.length>30)return [];
 return [...new Set(values.map(propertyName))];
}
function hasCredentials(env=process.env){
 return !!(env.GSC_ACCESS_TOKEN||
  env.GSC_SERVICE_ACCOUNT_JSON||env.GSC_SERVICE_ACCOUNT_FILE||env.GOOGLE_APPLICATION_CREDENTIALS);
}
function createGscClient({env=process.env,request=fetch,readFile=fs.readFileSync,clock=Date.now}={}){
 let current=null,loading=null;
 async function oauthToken(){
  if(env.GSC_ACCESS_TOKEN)return String(env.GSC_ACCESS_TOKEN).trim();
  if(current&&current.expiresAt>clock()+60000)return current.accessToken;
  if(loading)return loading;
  loading=(async()=>{
   let sa;
   try{
    if(env.GSC_SERVICE_ACCOUNT_JSON)sa=JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON);
    else if(env.GSC_SERVICE_ACCOUNT_FILE||env.GOOGLE_APPLICATION_CREDENTIALS)
     sa=JSON.parse(readFile(env.GSC_SERVICE_ACCOUNT_FILE||env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
   }catch{fail('服务账号配置无法读取或 JSON 无效',503)}
   if(!sa||typeof sa.client_email!=='string'||
      !sa.client_email.endsWith('.gserviceaccount.com')||typeof sa.private_key!=='string')
    fail('缺少服务端 Search Console 凭证；不会要求用户在网页输入私钥',503);
   const now=Math.floor(clock()/1000);
   const base64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
   const header=base64({alg:'RS256',typ:'JWT'});
   const body=base64({iss:sa.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3500});
   const unsigned=header+'.'+body;
   const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
   const assertion=unsigned+'.'+signer.sign(sa.private_key,'base64url');
   let response;
   try{response=await request(TOKEN_URL,{
     method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
     signal:AbortSignal.timeout(12000)
   });}catch{fail('Google 令牌服务暂不可用',503)}
   let value;try{value=await response.json()}catch{fail('Google 令牌响应无效',503)}
   if(!response.ok||typeof value.access_token!=='string')
    fail('服务账号未能获得 Search Console 只读授权，请核查 API 与权限',503);
   current={accessToken:value.access_token,expiresAt:clock()+Math.max(300,Number(value.expires_in)||3600)*1000};
   return current.accessToken;
  })();
  try{return await loading}finally{loading=null}
 }
 async function google(path,body){
  if(!hasCredentials(env))fail('服务器尚未配置 Search Console API 凭证',503);
  const token=await oauthToken();
  let response;
  try{response=await request(API+path,{
    method:body?'POST':'GET',
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(12000)
  });}catch{fail('Google Search Console API 请求超时或不可用',503)}
  let json;try{json=await response.json()}catch{fail('Google Search Console API 响应无效',503)}
  if(!response.ok){
   const code=response.status;
   if(code===401||code===403)fail('Search Console 权限不足；请授予服务账号此资源的读取权限',403);
   if(code===429)fail('Search Console API 配额不足，请稍后重试',429);
   fail('Search Console API 返回错误 '+code,503);
  }
  return json;
 }
 async function sites(ownerId){
  const allow=authorizedProperties(ownerId,env);
  if(!allow.length) return [];
  const entries=(await google('/sites')).siteEntry||[];
  return entries.filter(x=>allow.includes(x.siteUrl)&&
    ['siteOwner','siteFullUser','siteRestrictedUser'].includes(x.permissionLevel))
    .map(x=>({siteUrl:x.siteUrl,permissionLevel:x.permissionLevel}));
 }
 async function assertAllowedSite(ownerId,siteUrl){
  const site=propertyName(siteUrl);
  if(!authorizedProperties(ownerId,env).includes(site))
   fail('所选 Search Console 资源不在当前用户服务端允许名单中',403);
  const verified=await sites(ownerId);
  if(!verified.some(x=>x.siteUrl===site))
   fail('当前服务账号无法读取此 Search Console 资源',403);
  return site;
 }
 async function searchAnalytics(ownerId,{siteUrl,startDate,endDate,dimensions,rowLimit=500}){
  await assertAllowedSite(ownerId,siteUrl);
  if(!Array.isArray(dimensions)||!dimensions.length||
      dimensions.some(d=>!['date','query','page','device','country'].includes(d))||
      !Number.isInteger(rowLimit)||rowLimit<1||rowLimit>500)fail('Search Console 查询维度无效');
  const params={
   startDate,endDate,dimensions,rowLimit,startRow:0,type:'web',dataState:'final',
   aggregationType:dimensions.includes('page')?'byPage':'byProperty'
  };
  return google('/sites/'+encodeURIComponent(siteUrl)+'/searchAnalytics/query',params);
 }
 return {sites,assertAllowedSite,searchAnalytics,google,
  status(ownerId){const allowed=authorizedProperties(ownerId,env);
   return {configured:allowed.length>0&&hasCredentials(env),
    authorizationConfigured:hasCredentials(env),
    ownerAuthorized:allowed.length>0,
    mode:env.GSC_ACCESS_TOKEN?'server-access-token':env.GSC_SERVICE_ACCOUNT_JSON||
     env.GSC_SERVICE_ACCOUNT_FILE||env.GOOGLE_APPLICATION_CREDENTIALS?'service-account':'not-configured'};
  }};
}
const client=createGscClient();
module.exports={createGscClient,client,propertyName,authorizedProperties,hasCredentials};
