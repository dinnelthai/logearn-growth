'use strict';
// Server-only, read-only Google Search Console API bridge.
// Never accept OAuth credentials or arbitrary remote URLs from the browser.
const {createSign}=require('node:crypto'),fs=require('node:fs');
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const API='https://www.googleapis.com/webmasters/v3';
const INSPECTION_API='https://searchconsole.googleapis.com/v1';
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
function createGscClient({env=process.env,request=fetch,readFile=fs.readFileSync,clock=Date.now,oauthClient=null}={}){
 const userOAuth=oauthClient||(env===process.env?require('./gscOAuth').oauth:null);
 const isUserConnected=async ownerId=>!!(userOAuth&&userOAuth.available()&&await userOAuth.connected(ownerId));
 let current=null,loading=null;
 const siteCache=new Map();
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
 async function google(path,body,origin=API,ownerId=null){
  if(![API,INSPECTION_API].includes(origin))fail('未知 Google API 地址',400);
  const own=await isUserConnected(ownerId);
  if(!own&&!hasCredentials(env))fail('服务器尚未配置 Search Console API 凭证',503);
  const token=own?await userOAuth.accessToken(ownerId):await oauthToken();
  let response;
  try{response=await request(origin+path,{
    method:body?'POST':'GET',
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(12000)
  });}catch{fail('Google Search Console API 请求超时或不可用',503)}
  let json;try{json=await response.json()}catch{fail('Google Search Console API 响应无效',503)}
  if(!response.ok){
   const code=response.status;
   if(code===401||code===403)fail(own?'Google Search Console 账号无权读取此资源，请重新授权或检查网站权限':'Search Console 权限不足；请授予服务账号此资源的读取权限',403);
   if(code===429)fail('Search Console API 配额不足，请稍后重试',429);
   fail('Search Console API 返回错误 '+code,503);
  }
  return json;
 }
 async function sites(ownerId){
  if(await isUserConnected(ownerId)){
   const entries=(await google('/sites',null,API,ownerId)).siteEntry||[];
   return entries.filter(x=>['siteOwner','siteFullUser','siteRestrictedUser'].includes(x.permissionLevel))
    .map(x=>{try{return {siteUrl:propertyName(x.siteUrl),permissionLevel:x.permissionLevel}}catch{return null}})
    .filter(Boolean).slice(0,100);
  }
  const allow=authorizedProperties(ownerId,env);
  if(!allow.length) return [];
  const key=String(ownerId)+':'+allow.join('|'),cached=siteCache.get(key);
  if(cached&&cached.until>clock())return cached.sites.map(x=>({...x}));
  const entries=(await google('/sites')).siteEntry||[];
  const sites=entries.filter(x=>allow.includes(x.siteUrl)&&
    ['siteOwner','siteFullUser','siteRestrictedUser'].includes(x.permissionLevel))
    .map(x=>({siteUrl:x.siteUrl,permissionLevel:x.permissionLevel}));
  siteCache.set(key,{sites,until:clock()+60000});
  return sites.map(x=>({...x}));
 }
 async function assertAllowedSite(ownerId,siteUrl){
  const site=propertyName(siteUrl);
  const own=await isUserConnected(ownerId);
  if(!own&&!authorizedProperties(ownerId,env).includes(site))
   fail('所选 Search Console 资源不在当前用户服务端允许名单中',403);
  const verified=await sites(ownerId);
  if(!verified.some(x=>x.siteUrl===site))
   fail('当前 Google 账号无法读取此 Search Console 资源',403);
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
  return google('/sites/'+encodeURIComponent(siteUrl)+'/searchAnalytics/query',params,API,ownerId);
 }
 async function sitemaps(ownerId,siteUrl){
  await assertAllowedSite(ownerId,siteUrl);
  const r=await google('/sites/'+encodeURIComponent(siteUrl)+'/sitemaps',null,API,ownerId);
  if(r.sitemap!=null&&!Array.isArray(r.sitemap))
    fail('Google Sitemap 返回格式无效',503);
  return (r.sitemap||[]).slice(0,50).map(s=>({
    path:String(s.path||'').slice(0,1500),
    lastSubmitted:s.lastSubmitted||null,lastDownloaded:s.lastDownloaded||null,
    isPending:s.isPending===true,isSitemapsIndex:s.isSitemapsIndex===true,
    errors:Number.isFinite(Number(s.errors))?Number(s.errors):null,
    warnings:Number.isFinite(Number(s.warnings))?Number(s.warnings):null,
    type:s.type||null,
    content:(s.contents||[]).slice(0,10).map(c=>({
      type:c.type||null,submitted:c.submitted??null,indexed:c.indexed??null
    }))
  }));
 }
 async function inspect(ownerId,siteUrl,inspectionUrl){
  await assertAllowedSite(ownerId,siteUrl);
  let page;
  try{page=new URL(inspectionUrl)}catch{fail('网址检查地址无效')}
  if(page.protocol!=='https:'||page.username||page.password||page.hash||
     page.href.length>1500)fail('仅允许检查 HTTPS 页面且不能包含凭据或片段');
  if(siteUrl.startsWith('sc-domain:')){
   const domain=siteUrl.slice('sc-domain:'.length);
   if(page.hostname!==domain&&!page.hostname.endsWith('.'+domain))
    fail('所检查 URL 不属于当前 Search Console 域名资源',403);
  }else if(!page.href.startsWith(siteUrl))
   fail('所检查 URL 不属于当前 Search Console URL 前缀资源',403);
  const r=await google('/urlInspection/index:inspect',{
   inspectionUrl:page.href,siteUrl,languageCode:'zh-CN'
  },INSPECTION_API,ownerId);
  const status=r.inspectionResult?.indexStatusResult;
  if(!status||typeof status!=='object')fail('Google 尚未返回此 URL 的索引状态',503);
  return {inspectionUrl:page.href,siteUrl,
    verdict:status.verdict||null,coverageState:status.coverageState||null,
    robotsTxtState:status.robotsTxtState||null,
    indexingState:status.indexingState||null,
    pageFetchState:status.pageFetchState||null,
    lastCrawlTime:status.lastCrawlTime||null,
    googleCanonical:status.googleCanonical||null,
    userCanonical:status.userCanonical||null,
    source:'google-index-url-inspection',
    isLiveTest:false,
    warning:'仅查询 Google 索引中的版本，不是实时页面可索引性测试，也没有请求收录'};
 }
 return {sites,assertAllowedSite,searchAnalytics,sitemaps,inspect,google,
  async status(ownerId){
   const connected=await isUserConnected(ownerId),allowed=authorizedProperties(ownerId,env);
   return {configured:connected||(allowed.length>0&&hasCredentials(env)),
    authorizationConfigured:connected||hasCredentials(env),
    ownerAuthorized:connected||allowed.length>0,
    oauthAvailable:!!(userOAuth&&userOAuth.available()),
    oauthConnected:connected,
    mode:connected?'google-oauth':env.GSC_ACCESS_TOKEN?'server-access-token':env.GSC_SERVICE_ACCOUNT_JSON||
     env.GSC_SERVICE_ACCOUNT_FILE||env.GOOGLE_APPLICATION_CREDENTIALS?'service-account':'not-configured'};
  }};
}
const client=createGscClient();
module.exports={createGscClient,client,propertyName,authorizedProperties,hasCredentials};
