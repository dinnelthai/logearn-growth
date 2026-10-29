'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createXContentMonitor}=require('../src/services/xContentMonitor');
const {ACCOUNTS,valid}=require('../src/analytics/officialXAccounts');
function fixture(options={}){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE x_official_account_sync(owner_id TEXT NOT NULL,account TEXT NOT NULL,user_id TEXT,display_name TEXT,followers INTEGER,auto_sync INTEGER NOT NULL DEFAULT 0,last_synced INTEGER,last_attempt INTEGER,sync_error TEXT,PRIMARY KEY(owner_id,account));'+
  'CREATE TABLE x_official_posts(owner_id TEXT NOT NULL,account TEXT NOT NULL,post_id TEXT NOT NULL,published_at TEXT NOT NULL,body TEXT NOT NULL,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER,quotes INTEGER,observed_at INTEGER NOT NULL,PRIMARY KEY(owner_id,account,post_id));'+
  'CREATE TABLE x_official_follower_daily(owner_id TEXT NOT NULL,account TEXT NOT NULL,day TEXT NOT NULL,followers INTEGER NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(owner_id,account,day))');
 const time={now:Date.parse('2026-10-28T12:00:00Z')},calls=[],spent=[];
 let followers=101;
 const provider={
  profile:async(account,hooks)=>{
   calls.push('profile:'+account);
   const ref=hooks.reserve(18);hooks.settle(ref,18);
   if(options.fail)throw Error('账号数据源暂不可用');
   return {id:account==='logearn_cn'?'11':'22',
    userName:options.wrongProfile?'not_official':account,
    name:account,followers:followers++};
  },
  timeline:async(id,cursor,hooks)=>{
   calls.push('timeline:'+id);assert.equal(cursor,'');
   const ref=hooks.reserve(600);hooks.settle(ref,120);
   return {posts:[
    {id:id+'1',text:'Original content',createdAt:'2026-10-27T10:00:00Z',
     viewCount:100,likeCount:5,replyCount:2,retweetCount:3,isReply:false},
    {id:id+'2',text:'Missing views',createdAt:'2026-10-26T10:00:00Z',
     viewCount:null,likeCount:2,replyCount:0,retweetCount:1,isReply:false},
    {id:id+'3',text:'A reply',createdAt:'2026-10-25T10:00:00Z',
     viewCount:10,likeCount:0,replyCount:0,retweetCount:0,isReply:true}
   ]};
  }
 };
 const monitor=createXContentMonitor({db,clock:()=>time.now,
  env:{TWITTERAPI_IO_API_KEY:options.token===false?'':'test-key'},provider,
  reserve:(run,credits)=>{spent.push({run,credits});return spent.length},
  settle:(id,credits)=>{spent[id-1].actual=credits}});
 return {monitor,db,time,calls,spent};
}
test('official account options are reused; arbitrary usernames cannot be added',async()=>{
 assert.deepEqual(ACCOUNTS.map(a=>a.id),['logearn_cn','logearn_global']);
 assert.equal(valid('logearn_cn'),true);
 assert.equal(valid('other_username'),false);
 const f=fixture();
 const data=f.monitor.overview('owner');
 assert.deepEqual(data.accounts.map(a=>a.id),ACCOUNTS.map(a=>a.id));
 assert.equal(data.accounts[0].autoSync,false);
 assert.equal(f.calls.length,0);
 assert.throws(()=>f.monitor.setAutoSync('owner','not_official',true),/官方账号/);
 assert.throws(()=>f.monitor.setAutoSync('owner','logearn_cn',1),/是否/);
 await assert.rejects(f.monitor.sync('owner','nonofficial'),/官方账号/);
});
test('shared provider data, per-account and owner isolation, missing metrics are not zero',async()=>{
 const f=fixture();
 await f.monitor.sync('a','logearn_cn');
 let a=f.monitor.overview('a'),cn=a.accounts[0],global=a.accounts[1];
 assert.deepEqual(f.calls,['profile:logearn_cn','timeline:11']);
 assert.deepEqual(f.spent.map(s=>s.credits),[18,600]);
 assert.equal(cn.followers,101);
 assert.equal(cn.metrics.samplePosts,2);
 assert.equal(cn.metrics.measuredPosts,1);
 assert.equal(cn.metrics.engagementRate,10);
 assert.equal(cn.posts.find(p=>p.post_id==='112').impressions,null);
 assert.equal(global.posts.length,0);
 assert.equal(f.monitor.overview('b').accounts[0].posts.length,0);
 await f.monitor.sync('a','logearn_global');
 a=f.monitor.overview('a');
 assert.equal(a.accounts[0].posts.length,2);
 assert.equal(a.accounts[1].posts.length,2);
 await assert.rejects(f.monitor.sync('a','logearn_cn'),/一小时/);
 f.time.now+=86400000;
 await f.monitor.sync('a','logearn_cn');
 assert.equal(f.monitor.overview('a').accounts[0].metrics.followerChange,2);
});
test('daily sync is opt-in per account, errors are recorded, no additional OAuth',async()=>{
 const f=fixture();
 assert.equal((await f.monitor.syncDue()).checked,0);
 f.monitor.setAutoSync('a','logearn_global',true);
 assert.equal((await f.monitor.syncDue()).checked,1);
 assert.equal(f.calls[0],'profile:logearn_global');
 assert.equal((await f.monitor.syncDue()).checked,0);
 f.time.now+=86400000;
 assert.equal((await f.monitor.syncDue()).checked,1);
 const noKey=fixture({token:false});
 assert.throws(()=>noKey.monitor.setAutoSync('a','logearn_cn',true),/TWITTERAPI_IO_API_KEY/);
 await assert.rejects(noKey.monitor.sync('a','logearn_cn'),/TWITTERAPI_IO_API_KEY/);
 assert.equal(noKey.calls.length,0);
 const failed=fixture({wrongProfile:true});
 await assert.rejects(failed.monitor.sync('a','logearn_cn'),/不匹配/);
 assert.equal(failed.monitor.overview('a').accounts[0].lastSynced,null);
 assert.match(failed.monitor.overview('a').accounts[0].error,/不匹配/);
});
test('same account can have independent observation rows for different operators',async()=>{
 const f=fixture();
 await f.monitor.sync('owner-a','logearn_cn');
 await f.monitor.sync('owner-b','logearn_cn');
 assert.equal(f.db.prepare("SELECT COUNT(*) count FROM x_official_posts WHERE account='logearn_cn'").get().count,4);
 assert.equal(f.monitor.overview('owner-a').accounts[0].posts.length,2);
 assert.equal(f.monitor.overview('owner-b').accounts[0].posts.length,2);
});
