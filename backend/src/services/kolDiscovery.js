const {randomUUID,createHash}=require('node:crypto')
const fs=require('node:fs'),path=require('node:path')
const {OBJECTIVES,DIMENSIONS,STAGES,username,metrics,recommend,validateReview}=require('../analytics/kolProfiles')
const reviewed=require('../analytics/kolReviewedProfiles')
const accountsProvider=require('./twitterAccounts')
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const text=(value,max)=>{if(typeof value!=='string'||value.length>max)fail('文本格式或长度无效');return value.trim()}
function fingerprint(posts){return createHash('sha256').update(JSON.stringify(posts.map(p=>[p.id,p.text]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex')}
function createService(db,options={}){
  const acquisition=options.acquisition||require('./xAcquisition').createService(db)
  const provider=options.provider||accountsProvider
  const cacheDir=options.cacheDir||path.join(__dirname,'../../data/x-kol-research/2026-10-26')
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_kol_accounts(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,username TEXT NOT NULL COLLATE NOCASE,author_id TEXT,name TEXT NOT NULL,profile_json TEXT,snapshot_id TEXT,review_id TEXT,stage TEXT NOT NULL DEFAULT 'watch',assignee TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',next_followup_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(owner_id,username));
    CREATE UNIQUE INDEX IF NOT EXISTS x_kol_author ON x_kol_accounts(owner_id,author_id) WHERE author_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS x_kol_snapshots(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,account_id TEXT NOT NULL,fetched_at INTEGER NOT NULL,profile_json TEXT NOT NULL,posts_json TEXT NOT NULL,fingerprint TEXT NOT NULL,has_more INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS x_kol_snapshot_owner ON x_kol_snapshots(owner_id,account_id,fetched_at);
    CREATE TABLE IF NOT EXISTS x_kol_reviews(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,account_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,content_json TEXT NOT NULL,reviewer TEXT NOT NULL,reviewed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS x_kol_history(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,account_id TEXT NOT NULL,content TEXT NOT NULL,stage TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS x_kol_jobs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,account_id TEXT NOT NULL,state TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,posts INTEGER NOT NULL DEFAULT 0,pages INTEGER NOT NULL DEFAULT 0,error TEXT);
  `)
  function tx(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(error){db.exec('ROLLBACK');throw error}}
  const get=(owner,id)=>{const a=db.prepare('SELECT * FROM x_kol_accounts WHERE owner_id=? AND id=?').get(owner,id);if(!a)fail('KOL不存在或无权访问',404);return a}
  const version=(a,input)=>{if(a.updated_at!==input.expected_updated_at)fail('档案已更新，请刷新后重试',409)}
  const busy=()=>Boolean(db.prepare("SELECT 1 FROM x_acq_runs WHERE state='running'").get())
  function add(owner,input){
    const name=username(input.username)
    const old=db.prepare('SELECT * FROM x_kol_accounts WHERE owner_id=? AND username=? COLLATE NOCASE').get(owner,name)
    if(old)return old
    if(db.prepare('SELECT COUNT(*) AS n FROM x_kol_accounts WHERE owner_id=?').get(owner).n>=500)fail('当前候选池上限500个账号')
    const id=randomUUID(),now=Date.now()
    db.prepare('INSERT INTO x_kol_accounts(id,owner_id,username,name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,name,name,now,now)
    return get(owner,id)
  }
  function storeSnapshot(owner,id,profile,posts,fetchedAt,source,hasMore=false){
    const a=get(owner,id),distinct=[...new Map(posts.map(p=>[p.id,p])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,100)
    if(a.author_id&&a.author_id!==profile.id)fail('用户名对应的账号身份发生变化，已停止覆盖档案',409)
    const conflict=db.prepare('SELECT id FROM x_kol_accounts WHERE owner_id=? AND author_id=? AND id<>?').get(owner,profile.id,id)
    if(conflict)fail('该X账号已在候选池中，请使用已有档案',409)
    const snapshotId=randomUUID(),hash=fingerprint(distinct),at=Math.max(Date.now(),a.updated_at+1)
    db.prepare('INSERT INTO x_kol_snapshots VALUES(?,?,?,?,?,?,?,?,?)').run(snapshotId,owner,id,fetchedAt,JSON.stringify(profile),JSON.stringify(distinct),hash,+hasMore,source)
    db.prepare('UPDATE x_kol_accounts SET author_id=?,username=?,name=?,profile_json=?,snapshot_id=?,updated_at=? WHERE owner_id=? AND id=?').run(profile.id,profile.userName,profile.name,JSON.stringify(profile),snapshotId,at,owner,id)
    return snapshotId
  }
  function snapshot(owner,a){return a.snapshot_id?db.prepare('SELECT * FROM x_kol_snapshots WHERE owner_id=? AND account_id=? AND id=?').get(owner,a.id,a.snapshot_id):null}
  function assessment(owner,a){return a.review_id?db.prepare('SELECT * FROM x_kol_reviews WHERE owner_id=? AND account_id=? AND id=?').get(owner,a.id,a.review_id):null}
  function expose(owner,a,objective){
    const s=snapshot(owner,a),r=assessment(owner,a),posts=s?JSON.parse(s.posts_json):[],review=r?JSON.parse(r.content_json):null
    const reviewSnapshot=r?db.prepare('SELECT fingerprint FROM x_kol_snapshots WHERE id=? AND owner_id=?').get(r.snapshot_id,owner):null
    const recommendation=recommend({review,posts,snapshotId:s?.fingerprint,reviewSnapshotId:reviewSnapshot?.fingerprint,fetchedAt:s?.fetched_at||0},objective)
    const {profile_json,...account}=a
    return {...account,profile:profile_json?JSON.parse(profile_json):null,review,reviewer:r?.reviewer||null,reviewed_at:r?.reviewed_at||null,fetched_at:s?.fetched_at||null,snapshot_id:s?.id||null,has_more:!!s?.has_more,profile_url:'https://x.com/'+a.username,recommendation}
  }
  function recover(){db.prepare("UPDATE x_kol_jobs SET state='interrupted',finished_at=?,error='服务重启中断，旧画像和样本已保留' WHERE state='running' AND id IN (SELECT id FROM x_acq_runs WHERE state<>'running')").run(Date.now())}
  function list(owner,input={}){
    recover()
    const objective=input.objective||'trial';if(!OBJECTIVES[objective])fail('未知推荐目标')
    const q=text(input.q||'',120).toLowerCase(),stage=input.stage||'',status=input.status||'all'
    if(stage&&!STAGES[stage])fail('未知跟进状态')
    if(!['all','ranked','pending','limited'].includes(status))fail('画像筛选无效')
    const all=db.prepare('SELECT * FROM x_kol_accounts WHERE owner_id=? ORDER BY created_at,id').all(owner).map(a=>expose(owner,a,objective))
    // One account, multiple objectives; missing evidence never becomes a zero score.
    const confidenceOrder={supported:3,moderate:2,limited:1}
    all.sort((a,b)=>Number(b.recommendation.eligible)-Number(a.recommendation.eligible)||(b.recommendation.score??-1)-(a.recommendation.score??-1)||(confidenceOrder[b.recommendation.confidence]||0)-(confidenceOrder[a.recommendation.confidence]||0)||b.recommendation.coverage-a.recommendation.coverage||a.username.localeCompare(b.username))
    let rank=0;for(const a of all)a.rank=a.recommendation.eligible?++rank:null
    const rows=all.filter(a=>(!q||[a.username,a.name,a.review?.positioning,a.notes,...a.review?.tags||[]].join(' ').toLowerCase().includes(q))&&(!stage||a.stage===stage)&&(status==='all'||status==='ranked'&&a.recommendation.eligible||status==='pending'&&!a.review||status==='limited'&&['limited','needs_review','stale'].includes(a.recommendation.confidence)))
    const offset=Number(input.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>10000)fail('分页参数无效')
    const totalPosts=all.reduce((n,a)=>n+a.recommendation.metrics.sample_posts,0)
    return {accounts:rows.slice(offset,offset+20),total:rows.length,offset,limit:20,objective,objectives:OBJECTIVES,dimension_labels:DIMENSIONS,stages:STAGES,summary:{accounts:all.length,reviewed:all.filter(a=>a.review).length,ranked:rank,pending:all.filter(a=>!a.review).length,limited:all.filter(a=>a.recommendation.confidence==='limited').length,needs_review:all.filter(a=>a.recommendation.confidence==='needs_review').length,posts:totalPosts},jobs:db.prepare('SELECT j.*,a.name,a.username FROM x_kol_jobs j JOIN x_kol_accounts a ON a.id=j.account_id AND a.owner_id=j.owner_id WHERE j.owner_id=? ORDER BY j.started_at DESC LIMIT 12').all(owner),running:busy(),configured:require('./twitterApi').configured(),budget:acquisition.budget(),bootstrap_available:Object.keys(reviewed).some(name=>fs.existsSync(path.join(cacheDir,name+'.json'))),method:{version:'kol-review-v1',profile_mode:'reviewed',label:'内容审阅画像 + 可解释排名',description:'首批语义画像由本轮内容审阅形成；数据刷新不自动生成新的语义判断。受众和转化未验证时保持未知。'}}
  }
  function detail(owner,id,objective='trial'){
    const a=get(owner,id),s=snapshot(owner,a)
    const posts=s?JSON.parse(s.posts_json):[],exposed=expose(owner,a,objective)
    const history=db.prepare('SELECT * FROM x_kol_history WHERE owner_id=? AND account_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(owner,id)
    const review=assessment(owner,a),evidenceSnapshot=review?db.prepare('SELECT posts_json FROM x_kol_snapshots WHERE id=? AND owner_id=?').get(review.snapshot_id,owner):null
    const evidencePosts=evidenceSnapshot?JSON.parse(evidenceSnapshot.posts_json):[]
    const urls=p=>({...p,url:'https://x.com/'+a.username+'/status/'+p.id})
    return {account:exposed,posts:posts.map(urls),evidence_posts:evidencePosts.map(urls),history,reviews:db.prepare('SELECT id,reviewer,reviewed_at,snapshot_id FROM x_kol_reviews WHERE owner_id=? AND account_id=? ORDER BY reviewed_at DESC LIMIT 20').all(owner,id),objectives:OBJECTIVES,dimension_labels:DIMENSIONS,stages:STAGES}
  }
  function saveReview(owner,id,input,reviewer='运营内容审阅'){
    return tx(()=>{
      const a=get(owner,id);version(a,input)
      const s=snapshot(owner,a);if(!s)fail('请先采集账号内容，再补充画像')
      if(input.snapshot_id!==s.id)fail('内容样本已更新，请基于当前样本重新审阅',409)
      const value=validateReview(input.review,JSON.parse(s.posts_json)),reviewId=randomUUID(),now=Math.max(Date.now(),a.updated_at+1)
      db.prepare('INSERT INTO x_kol_reviews VALUES(?,?,?,?,?,?,?)').run(reviewId,owner,id,s.id,JSON.stringify(value),reviewer,now)
      db.prepare('UPDATE x_kol_accounts SET review_id=?,updated_at=? WHERE id=? AND owner_id=?').run(reviewId,now,id,owner)
      return detail(owner,id,input.objective||'trial')
    })
  }
  function saveFollowup(owner,id,input){return tx(()=>{
    const a=get(owner,id);version(a,input)
    const stage=input.stage??a.stage;if(!STAGES[stage])fail('跟进状态无效')
    const content=text(input.content||'',2000),notes=text(input.notes??a.notes,4000),assignee=text(input.assignee??a.assignee,80),next=input.next_followup_at===undefined?a.next_followup_at:input.next_followup_at
    if(next!=null&&(!Number.isSafeInteger(next)||next<0||next>4102444800000))fail('跟进时间无效')
    const now=Math.max(Date.now(),a.updated_at+1)
    db.prepare('UPDATE x_kol_accounts SET stage=?,notes=?,assignee=?,next_followup_at=?,updated_at=? WHERE owner_id=? AND id=?').run(stage,notes,assignee,next,now,owner,id)
    db.prepare('INSERT INTO x_kol_history VALUES(?,?,?,?,?,?)').run(randomUUID(),owner,id,content||'更新跟进档案：'+STAGES[a.stage]+' → '+STAGES[stage],stage,now)
    return detail(owner,id,input.objective||'trial')
  })}
  function bootstrap(owner){
    if(busy())fail('已有采集任务运行中，请稍后导入',409)
    const imported=[],skipped=[]
    return tx(()=>{
      for(const [name,review]of Object.entries(reviewed)){
        if(db.prepare('SELECT 1 FROM x_kol_accounts WHERE owner_id=? AND username=? COLLATE NOCASE').get(owner,name)){skipped.push(name);continue}
        const file=path.join(cacheDir,name+'.json');if(!fs.existsSync(file)){skipped.push(name);continue}
        let data;try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch{fail('本地审阅样本读取失败')}
        const profile=accountsProvider.cleanProfile(data.profile?.data),raw=[...data.timeline?.data?.tweets||[]]
        if(data.timeline?.data?.pin_tweet)raw.push(data.timeline.data.pin_tweet)
        // Include already observed keyword evidence so the cited tool posts remain auditable.
        const timelineIds=new Set(raw.map(p=>String(p.id)))
        for(const p of db.prepare('SELECT p.* FROM x_acq_posts p JOIN x_acq_leads l ON l.owner_id=p.owner_id AND l.id=p.lead_id WHERE l.owner_id=? AND l.username=? COLLATE NOCASE').all(owner,name))if(!timelineIds.has(String(p.id)))raw.push({id:p.id,text:p.text,createdAt:new Date(p.created_at).toISOString(),lang:p.lang,likeCount:p.likes,replyCount:p.replies})
        const posts=[...new Map(raw.map(p=>accountsProvider.cleanPost(p)).map(p=>[p.id,p])).values()]
        const a=add(owner,{username:name}),fetched=Date.parse(data.fetched_at);if(!Number.isFinite(fetched))fail('审阅样本时间无效')
        const snapshotId=storeSnapshot(owner,a.id,profile,posts,fetched,'已采集账号样本',!!data.timeline.has_next_page)
        const known=new Set(posts.map(p=>p.id)),safeReview=JSON.parse(JSON.stringify(review))
        // A missing citation is unknown, never a fabricated score.
        for(const d of Object.values(safeReview.dimensions)){d.evidence_ids=d.evidence_ids.filter(id=>known.has(id));if(d.value!==null&&!d.evidence_ids.length){d.value=null;d.reason+='；当前样本缺少引用，待补充'}}
        const value=validateReview(safeReview,posts),rid=randomUUID()
        db.prepare('INSERT INTO x_kol_reviews VALUES(?,?,?,?,?,?,?)').run(rid,owner,a.id,snapshotId,JSON.stringify(value),'Codex 本轮内容审阅',fetched)
        db.prepare('UPDATE x_kol_accounts SET review_id=? WHERE owner_id=? AND id=?').run(rid,owner,a.id)
        imported.push(name)
      }
      return {imported,skipped}
    })
  }
  function enqueue(owner,id){
    const a=get(owner,id)
    if(!require('./twitterApi').configured()&&!options.provider)fail('请先配置账号数据源',503)
    if(busy())fail('已有数据任务运行中，请稍后再试',409)
    const runId=randomUUID(),now=Date.now()
    tx(()=>{
      db.prepare("INSERT INTO x_acq_runs(id,owner_id,state,started_at) VALUES(?,?,'running',?)").run(runId,owner,now)
      db.prepare("INSERT INTO x_kol_jobs(id,owner_id,account_id,state,started_at) VALUES(?,?,?,'running',?)").run(runId,owner,id,now)
    })
    refresh(owner,a,runId).catch(()=>{})
    return db.prepare('SELECT * FROM x_kol_jobs WHERE id=? AND owner_id=?').get(runId,owner)
  }
  async function refresh(owner,a,runId){
    const hooks={reserve:credits=>acquisition.reserve(runId,credits),settle:(id,credits)=>acquisition.settle(id,credits)}
    let pages=0,posts=[],hasMore=false,cursor=''
    try{
      const profile=await provider.profile(a.username,hooks)
      if(a.author_id&&a.author_id!==profile.id)fail('用户名对应的账号身份发生变化，已停止覆盖档案',409)
      for(let page=0;page<3;page++){
        const batch=await provider.timeline(profile.id,cursor,hooks)
        posts.push(...batch.posts);if(batch.pin)posts.push(batch.pin)
        pages++;hasMore=batch.has_next_page
        db.prepare('UPDATE x_kol_jobs SET posts=?,pages=? WHERE id=?').run(posts.length,pages,runId)
        db.prepare('UPDATE x_acq_runs SET posts=?,pages=? WHERE id=?').run(posts.length,pages,runId)
        if(!hasMore||batch.posts.length&&Math.min(...batch.posts.map(p=>Date.parse(p.createdAt)))<Date.now()-90*86400000)break
        if(!batch.next_cursor||batch.next_cursor===cursor)fail('账号内容分页未推进',502)
        cursor=batch.next_cursor
      }
      tx(()=>{
        storeSnapshot(owner,a.id,profile,posts,Date.now(),'TwitterAPI.io 账号采集',hasMore)
        db.prepare("UPDATE x_kol_jobs SET state='complete',finished_at=? WHERE id=?").run(Date.now(),runId)
        db.prepare("UPDATE x_acq_runs SET state='complete',finished_at=?,rules=1 WHERE id=?").run(Date.now(),runId)
      })
    }catch(error){
      const message=error.status?error.message:'账号内容更新失败，原画像和样本已保留'
      db.prepare("UPDATE x_kol_jobs SET state='failed',finished_at=?,error=? WHERE id=?").run(Date.now(),message,runId)
      db.prepare("UPDATE x_acq_runs SET state='failed',finished_at=?,error=? WHERE id=?").run(Date.now(),message,runId)
    }
  }
  function candidates(owner){
    const watched=new Set(db.prepare('SELECT username FROM x_kol_accounts WHERE owner_id=?').all(owner).map(a=>a.username.toLowerCase())),found=new Map()
    for(const row of db.prepare("SELECT l.username,l.name,l.followers,p.text,p.id FROM x_acq_leads l JOIN x_acq_posts p ON l.owner_id=p.owner_id AND l.id=p.lead_id WHERE l.owner_id=? AND p.lang IN ('zh','zh-cn','zh-tw') ORDER BY l.followers DESC LIMIT 500").all(owner)){
      if(watched.has(row.username.toLowerCase())||!/^\w{1,15}$/.test(row.username))continue
      if(!found.has(row.username.toLowerCase()))found.set(row.username.toLowerCase(),{username:row.username,name:row.name,followers:row.followers,source:'中文内容中发现',evidence:row.text.slice(0,240),source_url:'https://x.com/i/status/'+row.id})
    }
    for(const a of db.prepare('SELECT * FROM x_kol_accounts WHERE owner_id=? AND snapshot_id IS NOT NULL').all(owner)){
      for(const p of JSON.parse(snapshot(owner,a).posts_json))for(const name of [...p.mentions||[],...Array.from(p.text.matchAll(/@([a-zA-Z0-9_]{1,15})/g),m=>m[1])]){
        if(watched.has(name.toLowerCase())||found.has(name.toLowerCase()))continue
        found.set(name.toLowerCase(),{username:name,name,followers:null,source:'被 @'+a.username+' 提及',evidence:p.text.slice(0,240),source_url:'https://x.com/'+a.username+'/status/'+p.id})
      }
    }
    return {candidates:[...found.values()].slice(0,100),note:'仅为发现入口；提及不代表认可或合作，中文发文不证明是KOL。加入后需要补充账号画像。'}
  }
  return {list,detail,add,saveReview,saveFollowup,bootstrap,enqueue,candidates,storeSnapshot}
}
let instance
const service=()=>instance||=createService(require('../db/connection'))
module.exports={createService,service,fingerprint}
