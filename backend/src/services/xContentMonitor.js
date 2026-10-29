'use strict';
// Official-account roster and upstream provider are shared with follower audit.
// The monitor holds only per-owner/per-account observations. It never posts.
const {randomUUID}=require('node:crypto');
const defaultDb=require('../db/connection');
const upstream=require('./twitterAccounts');
const {ACCOUNTS,valid}=require('../analytics/officialXAccounts');
const metrics=require('../analytics/xContentMetrics');
const DAY=86400000;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const positive=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const assertAccount=account=>{if(!valid(account))fail('请选择已有的 LogEarn 官方账号',400);return account};
function createXContentMonitor({db=defaultDb,clock=Date.now,
 env=process.env,provider=upstream,
 reserve=(run,credits)=>require('./xAcquisition').service().reserve(run,credits),
 settle=(id,credits)=>require('./xAcquisition').service().settle(id,credits)}={}){
 const configured=()=>Boolean(env.TWITTERAPI_IO_API_KEY?.trim());
 const snapshotsReady=()=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='x_official_post_snapshots'").get());
 function status(owner,account){
  return db.prepare('SELECT * FROM x_official_account_sync WHERE owner_id=? AND account=?').get(String(owner),account);
 }
 function overview(owner){
  const id=String(owner);
  const accounts=ACCOUNTS.map(a=>{
   const info=status(id,a.id);
   const posts=db.prepare('SELECT post_id,published_at,body,impressions,likes,replies,reposts,quotes,observed_at FROM x_official_posts WHERE owner_id=? AND account=? ORDER BY published_at DESC LIMIT 20').all(id,a.id);
   const rawHistory=snapshotsReady()?db.prepare('SELECT post_id,observed_at,impressions,likes,replies,reposts FROM x_official_post_snapshots WHERE owner_id=? AND account=? AND observed_at>=? ORDER BY observed_at DESC LIMIT 1800')
    .all(id,a.id,clock()-90*DAY):[];
   const byPost=new Map();
   for(const row of rawHistory){
    if(!byPost.has(row.post_id))byPost.set(row.post_id,[]);
    byPost.get(row.post_id).push(row);
   }
   const observed=posts.map(p=>metrics.enrich(p,byPost.get(p.post_id)||[]));
   const daily=db.prepare('SELECT day,followers FROM x_official_follower_daily WHERE owner_id=? AND account=? ORDER BY day DESC LIMIT 30').all(id,a.id).reverse();
   const recent=posts.filter(p=>p.published_at>=new Date(clock()-30*DAY).toISOString());
   const measured=recent.filter(p=>p.impressions>0&&[p.likes,p.replies,p.reposts].every(v=>v!=null));
   const views=measured.reduce((n,p)=>n+p.impressions,0);
   const interactions=measured.reduce((n,p)=>n+p.likes+p.replies+p.reposts+(p.quotes||0),0);
   const last=daily[daily.length-1];
   const first=last&&daily.find(d=>d.day>=new Date(Date.parse(last.day+'T00:00:00Z')-7*DAY).toISOString().slice(0,10));
   const ranked=[...measured].sort((x,y)=>{
    const rate=p=>(p.likes+p.replies+p.reposts+(p.quotes||0))/p.impressions;
    return rate(y)-rate(x);
   });
   return {id:a.id,label:a.label,username:a.id,autoSync:!!info?.auto_sync,
    followers:info?.followers??null,lastSynced:info?.last_synced??null,
    lastAttempt:info?.last_attempt??null,error:info?.sync_error??null,
    posts:observed,daily,benchmarks:{h24:metrics.benchmark(observed,'h24'),h48:metrics.benchmark(observed,'h48')},metrics:{
     samplePosts:recent.length,measuredPosts:measured.length,
     impressions:views||null,engagementRate:views?Math.round(interactions/views*10000)/100:null,
     followerChange:first&&first.day!==last.day?last.followers-first.followers:null,
     bestPost:ranked[0]?.post_id||null
    }};
  });
  return {configured:configured(),accounts,source:'twitterapi.io',scope:'third-party-public-metrics',attribution:'not-verified'};
 }
 function setAutoSync(owner,account,enabled){
  assertAccount(account);
  if(typeof enabled!=='boolean')fail('请选择是否每日自动同步');
  if(enabled&&!configured())fail('账号数据源未配置：TWITTERAPI_IO_API_KEY',503);
  db.prepare('INSERT INTO x_official_account_sync(owner_id,account,auto_sync) VALUES(?,?,?) ON CONFLICT(owner_id,account) DO UPDATE SET auto_sync=excluded.auto_sync')
   .run(String(owner),account,+enabled);
  return overview(owner);
 }
 async function sync(owner,account){
  assertAccount(account);
  if(!configured())fail('账号数据源未配置：TWITTERAPI_IO_API_KEY',503);
  if(!snapshotsReady())fail('X 快照表未初始化，请更新并重启后端',503);
  const id=String(owner),now=clock(),run=randomUUID();
  db.prepare('INSERT OR IGNORE INTO x_official_account_sync(owner_id,account) VALUES(?,?)').run(id,account);
  const claim=db.prepare('UPDATE x_official_account_sync SET last_attempt=?,sync_error=NULL WHERE owner_id=? AND account=? AND (last_attempt IS NULL OR last_attempt<?) RETURNING account')
   .get(now,id,account,now-3600000);
  if(!claim)fail('该账号最近一小时已同步或尝试同步，请稍后再试',429);
  const hooks={reserve:n=>reserve(run,n),settle:(ref,n)=>settle(ref,n)};
  try{
   const p=await provider.profile(account,hooks);
   if(!/^\d+$/.test(String(p?.id||''))||p?.userName?.toLowerCase()!==account)
    fail('数据源返回的账号与官方账号不匹配',502);
   const feed=await provider.timeline(p.id,'',hooks);
   if(!Array.isArray(feed?.posts)||feed.posts.length>20)
    fail('账号推文响应无效',502);
   const posts=feed.posts.filter(post=>!post.isReply&&!post.retweeted_tweet).slice(0,20);
   for(const post of posts)if(!/^\d+$/.test(String(post.id||''))||
    !Number.isFinite(Date.parse(post.createdAt))||typeof post.text!=='string')
    fail('账号推文包含无效数据',502);
   const stamp=clock(),day=new Date(stamp+7*3600000).toISOString().slice(0,10);
   const followers=positive(p.followers);
   db.exec('BEGIN IMMEDIATE');
   try{
    const state=db.prepare('SELECT 1 FROM x_official_account_sync WHERE owner_id=? AND account=?').get(id,account);
    if(!state)fail('监测配置已被移除',409);
    db.prepare('UPDATE x_official_account_sync SET user_id=?,display_name=?,followers=?,last_synced=?,sync_error=NULL WHERE owner_id=? AND account=?')
     .run(String(p.id),String(p.name||''),followers,stamp,id,account);
    if(followers!=null)db.prepare('INSERT INTO x_official_follower_daily(owner_id,account,day,followers,observed_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,account,day) DO UPDATE SET followers=excluded.followers,observed_at=excluded.observed_at')
     .run(id,account,day,followers,stamp);
    const put=db.prepare('INSERT INTO x_official_posts(owner_id,account,post_id,published_at,body,impressions,likes,replies,reposts,quotes,observed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,account,post_id) DO UPDATE SET published_at=excluded.published_at,body=excluded.body,impressions=excluded.impressions,likes=excluded.likes,replies=excluded.replies,reposts=excluded.reposts,quotes=excluded.quotes,observed_at=excluded.observed_at');
    for(const post of posts)put.run(id,account,String(post.id),
     new Date(post.createdAt).toISOString(),post.text.slice(0,1500),
     positive(post.viewCount),positive(post.likeCount),positive(post.replyCount),
     positive(post.retweetCount),null,stamp);
    const capture=db.prepare('INSERT OR IGNORE INTO x_official_post_snapshots(owner_id,account,post_id,observed_at,impressions,likes,replies,reposts,source) VALUES(?,?,?,?,?,?,?,?,?)');
    for(const post of posts)capture.run(id,account,String(post.id),stamp,
     positive(post.viewCount),positive(post.likeCount),positive(post.replyCount),
     positive(post.retweetCount),'twitterapi.io');
    // Bound time-series storage without touching the latest-post table.
    db.prepare('DELETE FROM x_official_post_snapshots WHERE owner_id=? AND account=? AND observed_at<?')
     .run(id,account,stamp-90*DAY);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
   return overview(id);
  }catch(error){
   db.prepare('UPDATE x_official_account_sync SET sync_error=? WHERE owner_id=? AND account=?')
    .run(String(error.message).slice(0,200),id,account);
   throw error;
  }
 }
 async function syncDue(){
  if(!configured())return {checked:0};
  const due=db.prepare('SELECT owner_id,account FROM x_official_account_sync WHERE auto_sync=1 AND (last_attempt IS NULL OR last_attempt<=?) ORDER BY COALESCE(last_attempt,0) LIMIT 10').all(clock()-DAY);
  for(const a of due)try{await sync(a.owner_id,a.account)}catch(e){console.warn('[x-content] sync:',e.message)}
  return {checked:due.length};
 }
 return {overview,setAutoSync,sync,syncDue,configured};
}
const monitor=createXContentMonitor();
module.exports={createXContentMonitor,monitor};
