'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGscOAuth,decrypt,encrypt}=require('../src/ai/growth/gscOAuth');
const env={GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',
 GOOGLE_REDIRECT_URI:'http://localhost:3001/api/gsc/oauth/callback',
 GSC_FRONTEND_ORIGIN:'http://localhost:5173',GSC_OAUTH_ENCRYPTION_KEY:'ab'.repeat(32)};
function fixture(){
 const states=new Map(),connections=new Map(),settings=new Map(),exchanges=[];
 const db={async query(sql,p){
  if(sql.startsWith('DELETE FROM ai_growth_gsc_oauth_states WHERE owner_id')){
   for(const [k,v] of states)if(v.owner===p[0]||v.expires<p[1])states.delete(k);
   return {rows:[]};
  }
  if(sql.startsWith('INSERT INTO ai_growth_gsc_oauth_states')){
   states.set(p[0],{owner:p[1],verifier:p[2],expires:p[3]});return {rows:[]};
  }
  if(sql.startsWith('DELETE FROM ai_growth_gsc_oauth_states WHERE state_hash')){
   const v=states.get(p[0]);if(v)states.delete(p[0]);
   return {rows:v&&v.expires>p[1]?[{owner_id:v.owner,code_verifier:v.verifier}]:[]};
  }
  if(sql.startsWith('INSERT INTO ai_growth_gsc_oauth_connections')){
   connections.set(p[0],p[1]);return {rows:[]};
  }
  if(sql.startsWith('SELECT owner_id FROM ai_growth_gsc_oauth_connections')){
   return {rows:connections.has(p[0])?[{owner_id:p[0]}]:[]};
  }
  if(sql.startsWith('SELECT refresh_token_enc,updated_at FROM ai_growth_gsc_oauth_connections')){
   return {rows:connections.has(p[0])?[{refresh_token_enc:connections.get(p[0]),updated_at:1000000}]:[]};
  }
  if(sql.startsWith('DELETE FROM ai_growth_gsc_oauth_connections')){
   connections.delete(p[0]);return {rows:[]};
  }
  if(sql.startsWith('DELETE FROM ai_growth_gsc_sync_jobs'))return {rows:[]};
  if(sql.startsWith('DELETE FROM ai_growth_gsc_settings')){
   settings.delete(p[0]);return {rows:[]};
  }
  throw Error('Unexpected DB query '+sql);
 }};
 const request=async(url,options)=>{
  assert.equal(url,'https://oauth2.googleapis.com/token');
  const params=new URLSearchParams(options.body);
  exchanges.push(params);
  return {ok:true,json:async()=>params.get('grant_type')==='authorization_code'?
   {access_token:'FIRST_ACCESS',refresh_token:'SUPER_SECRET_REFRESH',
    scope:'https://www.googleapis.com/auth/webmasters.readonly',expires_in:3600}:
   {access_token:'REFRESHED_ACCESS',expires_in:3600}};
 };
 return {db,request,states,connections,exchanges,settings};
}
test('OAuth state is one-use, owner-bound, PKCE-protected and stored as a hash',async()=>{
 const f=fixture(),oauth=createGscOAuth({db:f.db,request:f.request,env,clock:()=>1000000});
 const {authorizationUrl}=await oauth.start('owner-a'),url=new URL(authorizationUrl);
 assert.equal(url.origin,'https://accounts.google.com');
 assert.equal(url.searchParams.get('access_type'),'offline');
 assert.equal(url.searchParams.get('prompt'),'consent');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/webmasters.readonly');
 const state=url.searchParams.get('state');
 assert.ok(state&&state.length>32);
 assert.equal(f.states.has(state),false);
 assert.equal(f.states.size,1);
 const verifier=[...f.states.values()][0].verifier;
 const {createHash}=require('node:crypto');
 assert.equal(url.searchParams.get('code_challenge'),
  createHash('sha256').update(verifier).digest('base64url'));
 await oauth.complete(state,'authorization-code');
 assert.equal(await oauth.connected('owner-a'),true);
 assert.equal(await oauth.connected('owner-b'),false);
 assert.ok(!f.connections.get('owner-a').includes('SUPER_SECRET_REFRESH'));
 assert.equal(f.exchanges[0].get('code_verifier'),verifier);
 await assert.rejects(oauth.complete(state,'authorization-code'),/已使用/);
 assert.equal(await oauth.accessToken('owner-a'),'REFRESHED_ACCESS');
 assert.equal(await oauth.accessToken('owner-a'),'REFRESHED_ACCESS');
 assert.equal(f.exchanges.filter(x=>x.get('grant_type')==='refresh_token').length,1);
 assert.equal(f.exchanges[1].get('refresh_token'),'SUPER_SECRET_REFRESH');
 await oauth.disconnect('owner-a');
 assert.equal(await oauth.connected('owner-a'),false);
});
test('invalid OAuth encryption configuration fails closed',()=>{
 assert.throws(()=>encrypt('secret',Buffer.alloc(3)),/Invalid key length/);
 const secret=encrypt('secret',Buffer.from('ab'.repeat(32),'hex'));
 assert.equal(decrypt(secret,Buffer.from('ab'.repeat(32),'hex')),'secret');
 assert.throws(()=>decrypt(secret,Buffer.alloc(32)),/无法解密/);
});
test('OAuth callback without refresh token does not establish a connection',async()=>{
 const f=fixture();
 const oauth=createGscOAuth({db:f.db,env,clock:()=>1000000,
  request:async()=>({ok:true,json:async()=>({access_token:'x',
   scope:'https://www.googleapis.com/auth/webmasters.readonly'})})});
 const {authorizationUrl}=await oauth.start('owner-a');
 await assert.rejects(oauth.complete(new URL(authorizationUrl).searchParams.get('state'),'code'),/刷新令牌/);
 assert.equal(await oauth.connected('owner-a'),false);
});

test('missing GSC OAuth table reports an actionable AI migration error, not raw PostgreSQL SQL',async()=>{
 const db={query:async()=>{throw Object.assign(new Error('relation "ai_growth_gsc_oauth_connections" does not exist'),{code:'42P01'})}};
 const oauth=createGscOAuth({db,env});
 await assert.rejects(oauth.connected('owner-a'),error=>
   error.status===503&&/AI_DATABASE_URL/.test(error.message)&&/migrate:ai/.test(error.message));
});

test('GSC connection check propagates unrelated database errors',async()=>{
 const db={query:async()=>{throw Object.assign(new Error('database unavailable'),{code:'08006'})}};
 const oauth=createGscOAuth({db,env});
 await assert.rejects(oauth.connected('owner-a'),/database unavailable/);
});
