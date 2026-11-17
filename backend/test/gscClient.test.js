'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {createGscClient,propertyName,authorizedProperties}=require('../src/ai/growth/gscClient');
function tokenEnv(){return {GSC_ACCESS_TOKEN:'PRIVATE_TOKEN',
 GSC_OWNER_SITES_JSON:JSON.stringify({
  alice:['sc-domain:logearn.com','https://logearn.com/'],bob:['sc-domain:other.net']
 })};}
test('site discovery uses server-side user property ACL and Google permission checks',async()=>{
 const requests=[],client=createGscClient({env:tokenEnv(),clock:()=>Date.parse('2026-10-27T00:00:00Z'),
  request:async(url,options)=>{
   requests.push({url,auth:options.headers.Authorization,body:options.body});
   if(url.endsWith('/sites'))return {ok:true,status:200,json:async()=>({siteEntry:[
    {siteUrl:'sc-domain:logearn.com',permissionLevel:'siteOwner'},
    {siteUrl:'https://logearn.com/',permissionLevel:'siteFullUser'},
    {siteUrl:'sc-domain:other.net',permissionLevel:'siteRestrictedUser'},
    {siteUrl:'https://unapproved.example/',permissionLevel:'siteOwner'},
    {siteUrl:'sc-domain:hidden.net',permissionLevel:'siteUnverifiedUser'}
   ]})};
   if(url.includes('/sitemaps'))return {ok:true,status:200,json:async()=>({
    sitemap:[{path:'https://logearn.com/sitemap.xml',errors:'0',warnings:'1'}]
   })};
   if(url.includes('/urlInspection/index:inspect'))return {
    ok:true,status:200,json:async()=>({inspectionResult:{indexStatusResult:{
     verdict:'PASS',coverageState:'Submitted and indexed',
     lastCrawlTime:'2026-10-25T00:00:00Z'
    }}})
   };
   return {ok:true,status:200,json:async()=>({rows:[{keys:['2026-10-20'],clicks:4,
    impressions:100,ctr:0.04,position:5}]})};
  }});
 assert.equal((await client.sites('alice')).length,2);
 assert.equal((await client.sites('bob')).length,1);
 assert.deepEqual(await client.sites('stranger'),[]);
 await assert.rejects(client.assertAllowedSite('alice','sc-domain:other.net'),/允许名单/);
 const result=await client.searchAnalytics('alice',{siteUrl:'sc-domain:logearn.com',
  startDate:'2026-10-20',endDate:'2026-10-21',dimensions:['date'],rowLimit:31});
 assert.equal(result.rows[0].clicks,4);
 const request=requests.find(x=>x.url.includes('/searchAnalytics/query'));
 assert.ok(request.url.includes('sc-domain%3Alogearn.com'));
 assert.equal(request.auth,'Bearer PRIVATE_TOKEN');
 assert.equal(JSON.parse(request.body).dataState,'final');
 assert.equal(JSON.parse(request.body).aggregationType,'byProperty');
 await client.searchAnalytics('alice',{siteUrl:'https://logearn.com/',
  startDate:'2026-10-20',endDate:'2026-10-21',dimensions:['page'],rowLimit:100});
 assert.ok(requests.some(x=>x.url.includes('/searchAnalytics/query')&&
  JSON.parse(x.body||'{}').aggregationType==='byPage'));
 const sitemaps=await client.sitemaps('alice','sc-domain:logearn.com');
 assert.equal(sitemaps.length,1);assert.equal(sitemaps[0].warnings,1);
 const checked=await client.inspect('alice','sc-domain:logearn.com',
  'https://blog.logearn.com/holders');
 assert.equal(checked.coverageState,'Submitted and indexed');
 assert.equal(checked.isLiveTest,false);
 assert.ok(requests.some(x=>x.url==='https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'));
 await assert.rejects(client.inspect('alice','sc-domain:logearn.com',
  'https://logearn.com.evil.net/holders'),/不属于/);
 await assert.rejects(client.inspect('alice','sc-domain:logearn.com',
  'http://logearn.com/holders'),/HTTPS/);
 await assert.rejects(client.inspect('alice','https://logearn.com/',
  'https://logearn.com.evil.net/holders'),/不属于/);
 assert.equal(requests.filter(x=>x.url.endsWith('/sites')).length,2);
});
test('deny path, arbitrary property, missing configuration, and readonly credential leakage',async()=>{
 assert.throws(()=>propertyName('https://evil.test/?credential=x'),/HTTPS/);
 assert.throws(()=>propertyName('sc-domain:localhost'),/域名/);
 assert.throws(()=>propertyName('http://logearn.com/'),/HTTPS/);
 assert.deepEqual(authorizedProperties('intruder',tokenEnv()),[]);
 const client=createGscClient({env:{GSC_OWNER_ID:'alice',
  GSC_ALLOWED_SITES:'https://logearn.com/'}});
 assert.equal((await client.status('alice')).configured,false);
 await assert.rejects(client.sites('alice'),/凭证/);
});
test('service-account credential signs readonly JWT on server and never sends key to Search Console endpoint',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,
  privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const requests=[],env={GSC_SERVICE_ACCOUNT_JSON:JSON.stringify({
  client_email:'reader@logearn.iam.gserviceaccount.com',private_key:privateKey
 }),GSC_OWNER_ID:'alice',GSC_ALLOWED_SITES:'sc-domain:logearn.com'};
 const client=createGscClient({env,clock:()=>Date.parse('2026-10-27T00:00:00Z'),
  request:async(url,options)=>{
   requests.push({url,options});
   if(url==='https://oauth2.googleapis.com/token')return {ok:true,status:200,json:async()=>({
    access_token:'short-lived-token',expires_in:3600})};
   return {ok:true,status:200,json:async()=>({siteEntry:[
    {siteUrl:'sc-domain:logearn.com',permissionLevel:'siteFullUser'}]})};
  }});
 assert.equal((await client.sites('alice')).length,1);
 const tokenCall=requests[0];
 assert.equal(tokenCall.url,'https://oauth2.googleapis.com/token');
 const assertion=new URLSearchParams(tokenCall.options.body).get('assertion');
 const payload=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url').toString());
 assert.equal(payload.scope,'https://www.googleapis.com/auth/webmasters.readonly');
 assert.equal(payload.aud,'https://oauth2.googleapis.com/token');
 assert.equal(requests[1].options.headers.Authorization,'Bearer short-lived-token');
 assert.ok(!JSON.stringify(requests[1]).includes('BEGIN PRIVATE KEY'));
});

test('operator OAuth can list only Google-granted properties without server allowlist',async()=>{
 const calls=[],oauthClient={available:()=>true,
  connected:async id=>id==='alice',accessToken:async()=> 'USER_ACCESS_TOKEN'};
 const client=createGscClient({env:{},oauthClient,request:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/sites'))return {ok:true,status:200,json:async()=>({siteEntry:[
   {siteUrl:'sc-domain:logearn.com',permissionLevel:'siteOwner'},
   {siteUrl:'sc-domain:unverified.test',permissionLevel:'siteUnverifiedUser'}
  ]})};
  return {ok:true,status:200,json:async()=>({rows:[]})};
 }});
 const status=await client.status('alice');
 assert.equal(status.oauthConnected,true);
 assert.equal(status.mode,'google-oauth');
 assert.deepEqual(await client.sites('alice'),[{siteUrl:'sc-domain:logearn.com',permissionLevel:'siteOwner'}]);
 await client.searchAnalytics('alice',{siteUrl:'sc-domain:logearn.com',startDate:'2026-10-20',
  endDate:'2026-10-21',dimensions:['query']});
 assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer USER_ACCESS_TOKEN'));
 await assert.rejects(client.assertAllowedSite('alice','sc-domain:other.test'),/无法读取/);
 assert.deepEqual(await client.sites('bob'),[]);
});
