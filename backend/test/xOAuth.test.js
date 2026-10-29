'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {createXOAuth,config,decrypt}=require('../src/services/xOAuth');
const env={
 X_CLIENT_ID:'test-client',X_CLIENT_SECRET:'test-secret',
 X_REDIRECT_URI:'http://localhost:3001/api/x/oauth/callback',
 X_FRONTEND_ORIGIN:'http://localhost:5173',X_OAUTH_ENCRYPTION_KEY:'ab'.repeat(32)
};
function fixture(tokenOverride){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE x_oauth_states(state_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,code_verifier TEXT NOT NULL,expires_at INTEGER NOT NULL);CREATE TABLE x_oauth_connections(owner_id TEXT PRIMARY KEY,x_user_id TEXT NOT NULL,username TEXT NOT NULL,display_name TEXT NOT NULL,profile_image_url TEXT NOT NULL,access_token_enc TEXT NOT NULL,refresh_token_enc TEXT NOT NULL,expires_at INTEGER NOT NULL,connected_at INTEGER NOT NULL)');
 const calls=[];
 const request=async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('/oauth2/token'))return {ok:true,json:async()=>tokenOverride||{
   access_token:'super-secret-access',refresh_token:'super-secret-refresh',
   scope:'tweet.read users.read offline.access',expires_in:7200}};
  if(url.includes('/users/me'))return {ok:true,json:async()=>({data:{id:'123',username:'logearn',name:'LogEarn'}})};
  throw Error('unexpected endpoint');
 };
 return {db,calls,request};
}
test('X OAuth uses state hash, PKCE S256, exact owner binding and encrypted tokens',async()=>{
 const f=fixture(),oauth=createXOAuth({db:f.db,env,request:f.request,clock:()=>1000000});
 const {authorizationUrl}=oauth.start('owner-a'),url=new URL(authorizationUrl);
 assert.equal(url.origin,'https://x.com');
 assert.equal(url.searchParams.get('scope'),'tweet.read users.read offline.access');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 const state=url.searchParams.get('state');
 assert.notEqual(f.db.prepare('SELECT state_hash FROM x_oauth_states').get().state_hash,state);
 assert.equal(oauth.status('owner-b').connected,false);
 await oauth.complete(state,'auth-code');
 assert.equal(oauth.status('owner-a').account.username,'logearn');
 assert.equal(oauth.status('owner-b').connected,false);
 const row=f.db.prepare('SELECT * FROM x_oauth_connections').get();
 assert.ok(!JSON.stringify(row).includes('super-secret'));
 assert.equal(decrypt(row.refresh_token_enc,config(env).key),'super-secret-refresh');
 const exchange=f.calls[0].opts;
 assert.equal(exchange.headers.Authorization,'Basic '+Buffer.from('test-client:test-secret').toString('base64'));
 assert.equal(url.searchParams.get('code_challenge'),
  createHash('sha256').update(exchange.body.get('code_verifier')).digest('base64url'));
 await assert.rejects(oauth.complete(state,'auth-code'),/已使用/);
 oauth.disconnect('owner-a');
 assert.equal(oauth.status('owner-a').connected,false);
});
test('missing refresh token, invalid config or expired state never saves a connection',async()=>{
 const f=fixture({access_token:'access-only',scope:'tweet.read users.read offline.access'});
 const oauth=createXOAuth({db:f.db,env,request:f.request,clock:()=>1000000});
 const state=new URL(oauth.start('owner-a').authorizationUrl).searchParams.get('state');
 await assert.rejects(oauth.complete(state,'code'),/刷新令牌/);
 assert.equal(oauth.status('owner-a').connected,false);
 const another=new URL(oauth.start('owner-a').authorizationUrl).searchParams.get('state');
 const expired=createXOAuth({db:f.db,env,request:f.request,clock:()=>1600001});
 await assert.rejects(expired.complete(another,'code'),/过期/);
 assert.throws(()=>config({...env,X_FRONTEND_ORIGIN:'https://example.com/path'}),/地址/);
 assert.throws(()=>config({...env,X_OAUTH_ENCRYPTION_KEY:'not-hex'}),/64位/);
});
