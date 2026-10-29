'use strict';
// Official X public-data monitor: no user OAuth, no write permissions.
const defaultDb=require('../db/connection');
const DAY=86400000;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function usernameOf(value){
 const name=String(value||'').trim().replace(/^@/,'');
 if(!/^[A-Za-z0-9_]{1,15}$/.test(name))fail('请输入有效的 X 用户名（1–15 个字母、数字或下划线）');
 return name;
}
const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function createXContentMonitor({db=defaultDb,env=process.env,request=fetch,clock=Date.now}={}){
 const configured=()=>Boolean(env.TWITTER_BEARER_TOKEN?.trim());
 const account=owner=>db.prepare('SELECT * FROM x_content_accounts WHERE owner_id=?').get(String(owner));
 function overview(owner){
  const a=account(owner);
  const posts=db.prepare('SELECT post_id,published_at,body,impressions,likes,replies,reposts,quotes,bookmarks,observed_at FROM x_content_posts WHERE owner_id=? ORDER BY published_at DESC LIMIT 20').all(String(owner));
  const daily=db.prepare('SELECT day,followers FROM x_content_follower_daily WHERE owner_id=? ORDER BY day DESC LIMIT 30').all(String(owner)).reverse();
  const recent=posts.filter(p=>p.published_at>=new Date(clock()-30*DAY).toISOString());
  const measured=recent.filter(p=>p.impressions>0&&[p.likes,p.replies,p.reposts,p.quotes].every(v=>v!=null));
  const impressions=measured.reduce((s,p)=>s+p.impressions,0);
  const engagements=measured.reduce((s,p)=>s+p.likes+p.replies+p.reposts+p.quotes,0);
  const last=daily[daily.length-1];
  const first=last&&daily.find(d=>d.day>=new Date(Date.parse(last.day+'T00:00:00Z')-7*DAY).toISOString().slice(0,10));
  const ranked=[...measured].sort((a,b)=>(b.likes+b.replies+b.reposts+b.quotes)/b.impressions-(a.likes+a.replies+a.reposts+a.quotes)/a.impressions);
  return {configured:configured(),account:a?{username:a.username,name:a.display_name,followers:a.followers,autoSync:!!a.auto_sync,lastSynced:a.last_synced,lastAttempt:a.last_attempt,error:a.sync_error}:null,posts,daily,
   metrics:{samplePosts:recent.length,measuredPosts:measured.length,impressions:impressions||null,engagementRate:impressions?Math.round(engagements/impressions*10000)/100:null,
    followerChange:first&&first.day!==last.day?last.followers-first.followers:null,bestPost:ranked[0]?.post_id||null},
   source:'x-api-v2-public-metrics',attribution:'not-verified'};
 }
 function save(owner,input){
  const id=String(owner),username=usernameOf(input?.username),auto=input?.auto_sync===true;
  const old=account(id);
  db.exec('BEGIN IMMEDIATE');
  try{
   if(old&&old.username.toLowerCase()!==username.toLowerCase()){
    db.prepare('DELETE FROM x_content_posts WHERE owner_id=?').run(id);
    db.prepare('DELETE FROM x_content_follower_daily WHERE owner_id=?').run(id);
   }
   db.prepare('INSERT INTO x_content_accounts(owner_id,username,auto_sync) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET username=excluded.username,auto_sync=excluded.auto_sync,user_id=CASE WHEN lower(username)=lower(excluded.username) THEN user_id ELSE NULL END,display_name=CASE WHEN lower(username)=lower(excluded.username) THEN display_name ELSE NULL END,followers=CASE WHEN lower(username)=lower(excluded.username) THEN followers ELSE NULL END,last_synced=CASE WHEN lower(username)=lower(excluded.username) THEN last_synced ELSE NULL END,sync_error=NULL').run(id,username,+auto);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  return overview(id);
 }
 function remove(owner){
  const id=String(owner);
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const t of ['x_content_accounts','x_content_posts','x_content_follower_daily'])
    db.prepare('DELETE FROM '+t+' WHERE owner_id=?').run(id);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  return {account:null};
 }
 async function getJSON(url){
  const token=env.TWITTER_BEARER_TOKEN?.trim();
  if(!token)fail('请先在后端配置 TWITTER_BEARER_TOKEN',503);
  let response,data;
  try{
   response=await request(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
   data=await response.json();
  }catch{fail('X API 网络连接失败',502)}
  if(!response.ok){
   const messages={401:'X API Token 无效',402:'X API 余额不足',403:'X API 访问权限不足',404:'X 账号不存在',429:'X API 限流'};
   fail(messages[response.status]||'X API 暂不可用',response.status===429?429:502);
  }
  if(!data||typeof data!=='object'||data.errors?.length)fail('X API 返回了不完整的数据',502);
  return data;
 }
 async function sync(owner){
  const id=String(owner),now=clock(),a=account(id);
  if(!a)fail('请先填写 X 官方账号用户名');
  if(!configured())fail('请先配置 TWITTER_BEARER_TOKEN',503);
  const claim=db.prepare('UPDATE x_content_accounts SET last_attempt=?,sync_error=NULL WHERE owner_id=? AND (last_attempt IS NULL OR last_attempt<?) RETURNING username').get(now,id,now-3600000);
  if(!claim)fail('最近一小时已发起同步，避免重复消耗 API 额度',429);
  try{
   const handle=claim.username;
   const profile=await getJSON('https://api.x.com/2/users/by/username/'+encodeURIComponent(handle)+'?user.fields=public_metrics');
   const u=profile.data;
   if(!u||!(/^\d+$/.test(String(u.id)))||typeof u.username!=='string')fail('X 账号资料不完整',502);
   const url=new URL('https://api.x.com/2/users/'+u.id+'/tweets');
   url.search=new URLSearchParams({max_results:'10',exclude:'retweets,replies','tweet.fields':'created_at,public_metrics'}).toString();
   const listing=await getJSON(url),posts=listing.data??[];
   if(!Array.isArray(posts)||posts.some(p=>!/^\d+$/.test(String(p.id||''))||!Number.isFinite(Date.parse(p.created_at))||typeof p.text!=='string'))
    fail('X 帖子响应无效',502);
   const stamp=clock(),day=new Date(stamp+7*3600000).toISOString().slice(0,10),followers=number(u.public_metrics?.followers_count);
   db.exec('BEGIN IMMEDIATE');
   try{
    if(account(id)?.username.toLowerCase()!==handle.toLowerCase())fail('采集时账号已变更，请重试',409);
    db.prepare('UPDATE x_content_accounts SET user_id=?,display_name=?,followers=?,last_synced=?,sync_error=NULL WHERE owner_id=?').run(String(u.id),String(u.name||''),followers,stamp,id);
    if(followers!=null)db.prepare('INSERT INTO x_content_follower_daily(owner_id,day,followers,observed_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,day) DO UPDATE SET followers=excluded.followers,observed_at=excluded.observed_at').run(id,day,followers,stamp);
    const write=db.prepare('INSERT INTO x_content_posts(owner_id,post_id,published_at,body,impressions,likes,replies,reposts,quotes,bookmarks,observed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,post_id) DO UPDATE SET published_at=excluded.published_at,body=excluded.body,impressions=excluded.impressions,likes=excluded.likes,replies=excluded.replies,reposts=excluded.reposts,quotes=excluded.quotes,bookmarks=excluded.bookmarks,observed_at=excluded.observed_at');
    for(const p of posts){
     const m=p.public_metrics||{};
     write.run(id,String(p.id),new Date(p.created_at).toISOString(),p.text.slice(0,1500),number(m.impression_count),number(m.like_count),number(m.reply_count),number(m.retweet_count),number(m.quote_count),number(m.bookmark_count),stamp);
    }
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
   return overview(id);
  }catch(error){
   db.prepare('UPDATE x_content_accounts SET sync_error=? WHERE owner_id=? AND username=?').run(error.message,id,claim.username);
   throw error;
  }
 }
 async function syncDue(){
  if(!configured())return {checked:0};
  const due=db.prepare('SELECT owner_id FROM x_content_accounts WHERE auto_sync=1 AND (last_attempt IS NULL OR last_attempt<?) ORDER BY COALESCE(last_attempt,0) LIMIT 10').all(clock()-DAY);
  for(const a of due)try{await sync(a.owner_id)}catch(e){console.warn('[x-content] sync:',e.message)}
  return {checked:due.length};
 }
 return {overview,save,remove,sync,syncDue,configured};
}
const monitor=createXContentMonitor();
module.exports={createXContentMonitor,monitor,usernameOf};
