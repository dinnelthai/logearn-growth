'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createXContentMonitor,usernameOf}=require('../src/services/xContentMonitor');
function fixture(options={}){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE x_content_accounts(owner_id TEXT PRIMARY KEY,username TEXT NOT NULL,user_id TEXT,display_name TEXT,followers INTEGER,auto_sync INTEGER NOT NULL DEFAULT 0,last_synced INTEGER,last_attempt INTEGER,sync_error TEXT);CREATE TABLE x_content_posts(owner_id TEXT NOT NULL,post_id TEXT NOT NULL,published_at TEXT NOT NULL,body TEXT NOT NULL,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER,quotes INTEGER,bookmarks INTEGER,observed_at INTEGER NOT NULL,PRIMARY KEY(owner_id,post_id));CREATE TABLE x_content_follower_daily(owner_id TEXT NOT NULL,day TEXT NOT NULL,followers INTEGER NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(owner_id,day))');
 const calls=[],time={now:Date.parse('2026-10-28T12:00:00Z')};
 const request=async(url,requestOptions)=>{
  calls.push({url:String(url),requestOptions});
  if(options.fail)return {ok:false,status:options.fail,json:async()=>({error:'do not show provider secrets'})};
  if(String(url).includes('/by/username/'))return {ok:true,json:async()=>({data:{id:'42',username:'logearn',name:'LogEarn',public_metrics:{followers_count:101}}})};
  if(String(url).includes('/42/tweets'))return {ok:true,json:async()=>({data:[
   {id:'123',text:'Token holder distribution demo',created_at:'2026-10-27T10:00:00Z',
    public_metrics:{impression_count:100,like_count:5,reply_count:2,retweet_count:3,quote_count:0,bookmark_count:1}},
   {id:'124',text:'Second public post',created_at:'2026-10-26T10:00:00Z',
    public_metrics:{like_count:1,reply_count:0,retweet_count:0,quote_count:0}}
  ]})};
  throw Error('unexpected external request');
 };
 const env={TWITTER_BEARER_TOKEN:options.token===false?'':'test-token'};
 return {db,calls,time,monitor:createXContentMonitor({db,env,request,clock:()=>time.now})};
}
test('username only binding does not call X, invalid usernames are rejected',()=>{
 const f=fixture();
 assert.equal(usernameOf('@logearn'),'logearn');
 assert.throws(()=>usernameOf('https://x.com/logearn'),/用户名/);
 assert.throws(()=>usernameOf('a'.repeat(20)),/用户名/);
 f.monitor.save('a',{username:'@logearn',auto_sync:true});
 assert.equal(f.calls.length,0);
 assert.equal(f.monitor.overview('b').account,null);
 assert.equal(f.monitor.overview('a').account.username,'logearn');
});
test('read-only bounded sync imports metrics, preserves missing metrics, and isolates owners',async()=>{
 const f=fixture();
 f.monitor.save('a',{username:'logearn',auto_sync:true});
 await f.monitor.sync('a');
 assert.equal(f.calls.length,2);
 assert.ok(f.calls.every(c=>c.requestOptions.headers.Authorization==='Bearer test-token'));
 assert.ok(f.calls.every(c=>!c.requestOptions.method||c.requestOptions.method==='GET'));
 const url=new URL(f.calls[1].url);
 assert.equal(url.searchParams.get('max_results'),'10');
 assert.equal(url.searchParams.get('exclude'),'retweets,replies');
 const a=f.monitor.overview('a');
 assert.equal(a.account.followers,101);
 assert.equal(a.metrics.samplePosts,2);
 assert.equal(a.metrics.measuredPosts,1);
 assert.equal(a.metrics.engagementRate,10);
 assert.equal(a.posts.find(p=>p.post_id==='124').impressions,null);
 assert.equal(f.monitor.overview('b').posts.length,0);
 await assert.rejects(f.monitor.sync('a'),/1 小时/);
 f.time.now+=86400000;
 await f.monitor.syncDue();
 assert.equal(f.calls.length,4);
 assert.equal(f.monitor.overview('a').metrics.followerChange,0);
});
test('API failure does not forge success or leak upstream error, missing token fails closed',async()=>{
 const f=fixture({fail:403});
 f.monitor.save('owner',{username:'logearn'});
 await assert.rejects(f.monitor.sync('owner'),/访问权限不足/);
 assert.equal(f.monitor.overview('owner').account.lastSynced,null);
 assert.equal(f.monitor.overview('owner').account.error,'X API 访问权限不足');
 assert.ok(!JSON.stringify(f.monitor.overview('owner')).includes('provider secrets'));
 const missing=fixture({token:false});
 missing.monitor.save('owner',{username:'logearn'});
 await assert.rejects(missing.monitor.sync('owner'),/TWITTER_BEARER_TOKEN/);
 assert.equal(missing.calls.length,0);
});
test('switching username and removing monitoring never deletes manual content',async()=>{
 const f=fixture();
 f.monitor.save('a',{username:'logearn'});
 await f.monitor.sync('a');
 assert.equal(f.monitor.overview('a').posts.length,2);
 f.monitor.save('a',{username:'different'});
 assert.equal(f.monitor.overview('a').posts.length,0);
 assert.equal(f.monitor.overview('a').account.followers,null);
 f.monitor.remove('a');
 assert.equal(f.monitor.overview('a').account,null);
});
