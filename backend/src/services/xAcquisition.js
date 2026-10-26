const {randomUUID}=require('node:crypto')
const {STAGES,SEEDS,scorePost,draftReply,trackingUrl}=require('../analytics/xAcquisition')
const provider=require('./twitterApi')
const MINUTE=60000,DAY=86400000
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail('文本格式无效或超过长度限制');return value.trim()}
function createService(db,options={}) {
  const search=options.search||provider.search,configured=options.configured||provider.configured
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_acq_settings(owner_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,interval_minutes INTEGER NOT NULL DEFAULT 30,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS x_acq_rules(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,query TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,complete_until INTEGER,pending_since INTEGER,pending_until INTEGER,cursor TEXT NOT NULL DEFAULT '',last_attempt_at INTEGER,last_error TEXT,updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS x_acq_rules_owner ON x_acq_rules(owner_id);
    CREATE TABLE IF NOT EXISTS x_acq_leads(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,author_id TEXT NOT NULL,username TEXT NOT NULL,name TEXT NOT NULL,bio TEXT NOT NULL,followers INTEGER NOT NULL DEFAULT 0,best_post_id TEXT NOT NULL,score INTEGER NOT NULL,category TEXT NOT NULL,reasons TEXT NOT NULL,draft TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'new',assignee TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',next_followup_at INTEGER,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(owner_id,author_id));
    CREATE TABLE IF NOT EXISTS x_acq_posts(owner_id TEXT NOT NULL,id TEXT NOT NULL,lead_id TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,lang TEXT NOT NULL,likes INTEGER NOT NULL DEFAULT 0,replies INTEGER NOT NULL DEFAULT 0,score INTEGER NOT NULL,category TEXT NOT NULL,reasons TEXT NOT NULL,PRIMARY KEY(owner_id,id));
    CREATE TABLE IF NOT EXISTS x_acq_hits(owner_id TEXT NOT NULL,post_id TEXT NOT NULL,rule_id TEXT NOT NULL,PRIMARY KEY(owner_id,post_id,rule_id));
    CREATE TABLE IF NOT EXISTS x_acq_followups(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,lead_id TEXT NOT NULL,stage TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS x_acq_runs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,state TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,rules INTEGER NOT NULL DEFAULT 0,posts INTEGER NOT NULL DEFAULT 0,new_leads INTEGER NOT NULL DEFAULT 0,pages INTEGER NOT NULL DEFAULT 0,error TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS x_acq_one_run ON x_acq_runs(state) WHERE state='running';
    CREATE TABLE IF NOT EXISTS x_acq_spend(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,at INTEGER NOT NULL,credits INTEGER NOT NULL,uncertain INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS x_acq_spend_at ON x_acq_spend(at);
    CREATE TABLE IF NOT EXISTS x_acq_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS x_acq_posts_lead ON x_acq_posts(owner_id,lead_id,created_at);
    CREATE INDEX IF NOT EXISTS x_acq_hits_rule ON x_acq_hits(owner_id,rule_id,post_id);
    CREATE INDEX IF NOT EXISTS x_acq_leads_owner_stage ON x_acq_leads(owner_id,stage,score);
    CREATE INDEX IF NOT EXISTS x_acq_followups_lead ON x_acq_followups(owner_id,lead_id,created_at);
  `)
  let transactionDepth=0
  function tx(fn){
    if(transactionDepth)return fn()
    db.exec('BEGIN IMMEDIATE');transactionDepth++
    try{const value=fn();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}finally{transactionDepth--}
  }
  const rule=(owner,id)=>{const row=db.prepare('SELECT * FROM x_acq_rules WHERE id=? AND owner_id=?').get(id,owner);if(!row)fail('关键词不存在或无权访问',404);return row}
  const lead=(owner,id)=>{const row=db.prepare('SELECT * FROM x_acq_leads WHERE id=? AND owner_id=?').get(id,owner);if(!row)fail('线索不存在或无权访问',404);return row}
  const busy=()=>Boolean(db.prepare("SELECT 1 FROM x_acq_runs WHERE state='running'").get())
  function checkVersion(old,input){if(old.updated_at!==input.expected_updated_at)fail('记录已更新，请刷新后重试',409)}
  function settings(owner){return db.prepare('SELECT * FROM x_acq_settings WHERE owner_id=?').get(owner)||{owner_id:owner,enabled:0,interval_minutes:30,updated_at:0}}
  function setup(owner){return tx(()=>{
    if(!db.prepare('SELECT 1 FROM x_acq_settings WHERE owner_id=?').get(owner))db.prepare('INSERT INTO x_acq_settings(owner_id,updated_at) VALUES(?,?)').run(owner,Date.now())
    if(!db.prepare('SELECT 1 FROM x_acq_rules WHERE owner_id=?').get(owner))for(const seed of SEEDS)saveRule(owner,null,seed)
    return settings(owner)
  })}
  function saveSettings(owner,input){
    if(typeof input.enabled!=='boolean'||![15,30,60,120].includes(input.interval_minutes))fail('请选择监听开关和15/30/60/120分钟间隔')
    if(input.enabled&&!configured())fail('请先配置后端数据源密钥')
    const old=settings(owner);checkVersion(old,input)
    const at=Math.max(Date.now(),old.updated_at+1)
    db.prepare('INSERT INTO x_acq_settings VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,interval_minutes=excluded.interval_minutes,updated_at=excluded.updated_at').run(owner,+input.enabled,input.interval_minutes,at)
    return settings(owner)
  }
  function saveRule(owner,id,input){
    if(busy())fail('采集进行中，请结束后修改关键词',409)
    const old=id?rule(owner,id):null;if(old)checkVersion(old,input)
    const name=text(input.name,80,true),query=text(input.query,500,true)
    if(/since:|until:|since_time:|until_time:|\bx-api-key\b/i.test(query))fail('搜索时间由采集器管理，请移除时间参数或密钥字段')
    if(input.enabled!==undefined&&typeof input.enabled!=='boolean')fail('启用状态无效')
    const enabled=input.enabled??Boolean(old?.enabled??1),at=Math.max(Date.now(),(old?.updated_at||0)+1)
    if(old){
      const changed=query!==old.query
      db.prepare(`UPDATE x_acq_rules SET name=?,query=?,enabled=?,updated_at=?,complete_until=?,pending_since=?,pending_until=?,cursor=?,last_error=NULL WHERE id=? AND owner_id=?`).run(name,query,+enabled,at,changed?null:old.complete_until,changed?null:old.pending_since,changed?null:old.pending_until,changed?'':old.cursor,id,owner)
    }else{
      if(db.prepare('SELECT COUNT(*) AS n FROM x_acq_rules WHERE owner_id=?').get(owner).n>=10)fail('每位运营最多10组关键词，请编辑或停用现有关键词')
      id=randomUUID();db.prepare('INSERT INTO x_acq_rules(id,owner_id,name,query,enabled,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,name,query,+enabled,at)
    }
    return rule(owner,id)
  }
  function budget(){
    const at=Date.now(),start=Math.floor((at+7*3600000)/DAY)*DAY-7*3600000
    const configuredBudget=Number(process.env.X_ACQUISITION_DAILY_USD??1)
    const limit=Number.isFinite(configuredBudget)&&configuredBudget>=0?Math.floor(configuredBudget*100000):100000
    const spent=db.prepare('SELECT COALESCE(SUM(credits),0) AS credits,COALESCE(SUM(CASE WHEN uncertain=1 THEN credits ELSE 0 END),0) AS uncertain FROM x_acq_spend WHERE at>=?').get(start)
    return {limit_usd:limit/100000,estimated_usd:spent.credits/100000,uncertain_usd:spent.uncertain/100000,remaining_credits:Math.max(0,limit-spent.credits),day_start:start}
  }
  function reserve(runId,credits=300){return tx(()=>{
    if(!Number.isSafeInteger(credits)||credits<15||credits>1000)fail('请求费用预算无效')
    if(budget().remaining_credits<credits)fail('今日采集预算不足，已停止；预算按整个后台共享',429)
    const id=randomUUID();db.prepare('INSERT INTO x_acq_spend(id,run_id,at,credits) VALUES(?,?,?,?)').run(id,runId,Date.now(),credits);return id
  })}
  function settle(id,credits){db.prepare('UPDATE x_acq_spend SET credits=?,uncertain=0 WHERE id=?').run(credits,id)}
  function ingest(owner,r,posts){return tx(()=>{
    let added=0
    for(const post of posts){
      const author=post.author,at=Date.now(),rated=scorePost(post,at)
      let row=db.prepare('SELECT * FROM x_acq_leads WHERE owner_id=? AND author_id=?').get(owner,String(author.id))
      if(!row){
        const id=randomUUID();db.prepare('INSERT INTO x_acq_leads(id,owner_id,author_id,username,name,bio,followers,best_post_id,score,category,reasons,draft,first_seen_at,last_seen_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,String(author.id),String(author.userName||'').slice(0,50),String(author.name||'').slice(0,200),String(author.description||'').slice(0,4000),Number.isSafeInteger(author.followers)&&author.followers>=0?author.followers:0,String(post.id),rated.score,rated.category,JSON.stringify(rated.reasons),draftReply(post,rated.category),at,at,at)
        row=lead(owner,id);added++
      }else{
        // New evidence must never overwrite an operator's stage, notes or follow-up.
        const best=db.prepare('SELECT created_at FROM x_acq_posts WHERE owner_id=? AND id=?').get(owner,row.best_post_id)
        if(rated.score>row.score||rated.score===row.score&&Date.parse(post.createdAt)>(best?.created_at||0))db.prepare('UPDATE x_acq_leads SET best_post_id=?,score=?,category=?,reasons=?,draft=? WHERE id=? AND owner_id=?').run(String(post.id),rated.score,rated.category,JSON.stringify(rated.reasons),draftReply(post,rated.category),row.id,owner)
        db.prepare('UPDATE x_acq_leads SET last_seen_at=? WHERE id=? AND owner_id=?').run(at,row.id,owner)
      }
      db.prepare('INSERT INTO x_acq_posts VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,id) DO UPDATE SET likes=excluded.likes,replies=excluded.replies').run(owner,String(post.id),row.id,post.text.slice(0,30000),Date.parse(post.createdAt),String(post.lang||''),Number.isSafeInteger(post.likeCount)?post.likeCount:0,Number.isSafeInteger(post.replyCount)?post.replyCount:0,rated.score,rated.category,JSON.stringify(rated.reasons))
      db.prepare('INSERT OR IGNORE INTO x_acq_hits VALUES(?,?,?)').run(owner,String(post.id),r.id)
    }
    return added
  })}
  function collectionRules(owner,input={}){
    if(!configured())fail('请在后端配置 TWITTERAPI_IO_API_KEY',503)
    if(busy())fail('已有采集任务正在运行，请稍后刷新',409)
    const rules=input.rule_id?[rule(owner,text(input.rule_id,80,true))]:db.prepare('SELECT * FROM x_acq_rules WHERE owner_id=? AND enabled=1 ORDER BY COALESCE(last_attempt_at,0),id').all(owner)
    if(!rules.length)fail('请先添加并启用至少一组关键词')
    return rules
  }
  function enqueue(owner,input={}){
    collectionRules(owner,input)
    const task=collect(owner,input)
    // collect persists its running row before yielding to the provider request.
    // Errors are recorded by collect; no unhandled rejection or upstream payload logging.
    task.catch(()=>{})
    return db.prepare("SELECT * FROM x_acq_runs WHERE owner_id=? AND state='running'").get(owner)
  }
  async function collect(owner,input={}){
    const rules=collectionRules(owner,input)
    const id=randomUUID(),now=Date.now()
    db.prepare("INSERT INTO x_acq_runs(id,owner_id,state,started_at) VALUES(?,?,'running',?)").run(id,owner,now)
    let pages=0,posts=0,newLeads=0,processed=0,partial=false,errors=[]
    try{
      for(const r of rules){
        const until=r.pending_until||now-30000,since=r.pending_since||Math.max(0,r.complete_until?r.complete_until-120000:until-DAY)
        let cursor=r.cursor||''
        db.prepare('UPDATE x_acq_rules SET last_attempt_at=?,pending_since=?,pending_until=? WHERE id=?').run(Date.now(),since,until,r.id)
        try{
          for(let page=0;page<3;page++){
            const data=await search({query:`(${r.query}) since_time:${Math.floor(since/1000)} until_time:${Math.floor(until/1000)}`,cursor,beforeAttempt:()=>reserve(id),settleAttempt:settle})
            if(data.has_next_page&&data.next_cursor===cursor)throw Object.assign(Error('数据源分页游标未推进，进度已保留'),{status:502})
            tx(()=>{
              newLeads+=ingest(owner,r,data.tweets)
              if(data.has_next_page)db.prepare('UPDATE x_acq_rules SET pending_since=?,pending_until=?,cursor=?,last_error=NULL WHERE id=?').run(since,until,data.next_cursor,r.id)
              else db.prepare("UPDATE x_acq_rules SET complete_until=?,pending_since=NULL,pending_until=NULL,cursor='',last_error=NULL WHERE id=?").run(until,r.id)
            })
            pages++;posts+=data.tweets.length
            db.prepare('UPDATE x_acq_runs SET posts=?,new_leads=?,pages=? WHERE id=?').run(posts,newLeads,pages,id)
            if(!data.has_next_page)break
            cursor=data.next_cursor
            if(page===2)partial=true
          }
          processed++
          db.prepare('UPDATE x_acq_runs SET rules=? WHERE id=?').run(processed,id)
        }catch(error){
          const message=error.status?error.message:'采集失败，进度已保留'
          db.prepare('UPDATE x_acq_rules SET last_error=? WHERE id=?').run(message,r.id)
          errors.push(r.name+'：'+message)
          // Authentication, credit exhaustion and budget errors should not fan out.
          if(/密钥|余额|预算|拒绝访问/.test(message))break
        }
      }
      const state=errors.length?(pages?'partial':'failed'):partial?'partial':'complete'
      db.prepare('UPDATE x_acq_runs SET state=?,finished_at=?,rules=?,posts=?,new_leads=?,pages=?,error=? WHERE id=?').run(state,Date.now(),processed,posts,newLeads,pages,errors.join('；')||null,id)
    }catch(error){db.prepare("UPDATE x_acq_runs SET state='failed',finished_at=?,error='采集内部异常，已保留完成进度' WHERE id=?").run(Date.now(),id);throw error}
    return db.prepare('SELECT * FROM x_acq_runs WHERE id=? AND owner_id=?').get(id,owner)
  }
  function expose(row){return {...row,reasons:JSON.parse(row.reasons),url:'https://x.com/i/status/'+row.best_post_id,profile_url:'https://x.com/i/user/'+row.author_id,tracking_url:trackingUrl(row.id)}}
  function filters(owner,input){
    const args=[owner],where=['l.owner_id=?']
    if(input.stage){if(!STAGES.includes(input.stage))fail('线索状态无效');where.push('l.stage=?');args.push(input.stage)}
    if(input.rule_id){rule(owner,input.rule_id);where.push('EXISTS(SELECT 1 FROM x_acq_posts p JOIN x_acq_hits h ON h.owner_id=p.owner_id AND h.post_id=p.id WHERE p.lead_id=l.id AND p.owner_id=l.owner_id AND h.rule_id=?)');args.push(input.rule_id)}
    if(input.q){const q=text(input.q,120);where.push('(l.username LIKE ? OR l.name LIKE ? OR l.notes LIKE ? OR EXISTS(SELECT 1 FROM x_acq_posts p WHERE p.owner_id=l.owner_id AND p.lead_id=l.id AND p.text LIKE ?))');args.push(...Array(4).fill('%'+q+'%'))}
    if(input.high==='1')where.push("l.score>=60 AND l.stage NOT IN ('dismissed','closed')")
    if(input.due==='1'){where.push("l.next_followup_at<=? AND l.stage NOT IN ('dismissed','closed')");args.push(Date.now())}
    return {where:where.join(' AND '),args}
  }
  function list(owner,input={}){
    const offset=Number(input.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail('分页参数无效')
    const {where,args}=filters(owner,input)
    const rows=db.prepare(`SELECT l.*,p.text AS post_text,p.created_at AS posted_at,(SELECT COUNT(*) FROM x_acq_posts p2 WHERE p2.owner_id=l.owner_id AND p2.lead_id=l.id) AS post_count FROM x_acq_leads l JOIN x_acq_posts p ON p.owner_id=l.owner_id AND p.id=l.best_post_id WHERE ${where} ORDER BY l.score DESC,p.created_at DESC,l.id LIMIT 30 OFFSET ?`).all(...args,offset)
    return {leads:rows.map(expose),total:db.prepare(`SELECT COUNT(*) AS n FROM x_acq_leads l WHERE ${where}`).get(...args).n,offset,limit:30}
  }
  function detail(owner,id){
    const row=lead(owner,id)
    return {lead:expose(row),posts:db.prepare('SELECT * FROM x_acq_posts WHERE owner_id=? AND lead_id=? ORDER BY created_at DESC LIMIT 50').all(owner,id).map(p=>({...p,url:'https://x.com/i/status/'+p.id,reasons:JSON.parse(p.reasons),rules:db.prepare('SELECT r.name FROM x_acq_hits h JOIN x_acq_rules r ON h.rule_id=r.id AND h.owner_id=r.owner_id WHERE h.owner_id=? AND h.post_id=?').all(owner,p.id).map(r=>r.name)})),followups:db.prepare('SELECT * FROM x_acq_followups WHERE owner_id=? AND lead_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(owner,id)}
  }
  function updateLead(owner,id,input){return tx(()=>{
    const old=lead(owner,id);checkVersion(old,input)
    const stage=input.stage??old.stage;if(!STAGES.includes(stage))fail('线索状态无效')
    const notes=text(input.notes??old.notes,4000),assignee=text(input.assignee??old.assignee,80),content=text(input.content||'',2000)
    const next=input.next_followup_at===undefined?old.next_followup_at:input.next_followup_at
    if(next!=null&&(!Number.isSafeInteger(next)||next<0||next>4102444800000))fail('跟进时间无效')
    if(stage==='trial'&&old.stage!==stage&&!content)fail('请记录确认体验的依据；此状态是人工记录')
    const at=Math.max(Date.now(),old.updated_at+1)
    db.prepare('UPDATE x_acq_leads SET stage=?,notes=?,assignee=?,next_followup_at=?,updated_at=? WHERE id=? AND owner_id=?').run(stage,notes,assignee,next,at,id,owner)
    db.prepare('INSERT INTO x_acq_followups VALUES(?,?,?,?,?,?)').run(randomUUID(),owner,id,stage,content||'更新跟进档案：'+old.stage+' → '+stage,at)
    return detail(owner,id)
  })}
  function overview(owner){
    const counts=Object.fromEntries(STAGES.map(s=>[s,0]))
    for(const row of db.prepare('SELECT stage,COUNT(*) AS n FROM x_acq_leads WHERE owner_id=? GROUP BY stage').all(owner))counts[row.stage]=row.n
    return {configured:configured(),settings:settings(owner),rules:db.prepare('SELECT * FROM x_acq_rules WHERE owner_id=? ORDER BY name,id').all(owner),counts,high_intent:db.prepare("SELECT COUNT(*) AS n FROM x_acq_leads WHERE owner_id=? AND score>=60 AND stage NOT IN ('dismissed','closed')").get(owner).n,due:db.prepare("SELECT COUNT(*) AS n FROM x_acq_leads WHERE owner_id=? AND next_followup_at<=? AND stage NOT IN ('dismissed','closed')").get(owner,Date.now()).n,total_posts:db.prepare('SELECT COUNT(*) AS n FROM x_acq_posts WHERE owner_id=?').get(owner).n,budget:budget(),runs:db.prepare('SELECT * FROM x_acq_runs WHERE owner_id=? ORDER BY started_at DESC LIMIT 15').all(owner),running:busy(),scoring:'rules-v3',note:'规则筛选辅助人工判断；已体验为人工确认。UTM链接尚未接通逐线索站内转化，不能据此统计注册或核心用户。'}
  }
  let ticking=false
  async function tick(){
    if(ticking||busy()||!configured())return
    ticking=true
    try{
      const owners=db.prepare('SELECT * FROM x_acq_settings WHERE enabled=1 ORDER BY updated_at').all()
      for(const s of owners){
        const last=db.prepare('SELECT MAX(started_at) AS at FROM x_acq_runs WHERE owner_id=?').get(s.owner_id).at||0
        if(Date.now()-last<s.interval_minutes*MINUTE)continue
        if(budget().remaining_credits<300)break
        await collect(s.owner_id)
      }
    }finally{ticking=false}
  }
  function start(){
    db.prepare("UPDATE x_acq_runs SET state='interrupted',finished_at=?,error='服务重启中断，已保留分页进度' WHERE state='running'").run(Date.now())
    const timer=setInterval(()=>tick().catch(()=>{}),MINUTE);timer.unref();return ()=>clearInterval(timer)
  }
  // Versioned rescoring refreshes evidence without touching operator review state.
  if(db.prepare("SELECT value FROM x_acq_meta WHERE key='scoring'").get()?.value!=='rules-v3')tx(()=>{
    for(const p of db.prepare('SELECT * FROM x_acq_posts').all()){
      const rated=scorePost({text:p.text,createdAt:new Date(p.created_at).toISOString()})
      db.prepare('UPDATE x_acq_posts SET score=?,category=?,reasons=? WHERE owner_id=? AND id=?').run(rated.score,rated.category,JSON.stringify(rated.reasons),p.owner_id,p.id)
    }
    for(const l of db.prepare('SELECT id,owner_id FROM x_acq_leads').all()){
      const p=db.prepare('SELECT * FROM x_acq_posts WHERE owner_id=? AND lead_id=? ORDER BY score DESC,created_at DESC LIMIT 1').get(l.owner_id,l.id)
      if(p)db.prepare('UPDATE x_acq_leads SET best_post_id=?,score=?,category=?,reasons=?,draft=? WHERE id=? AND owner_id=?').run(p.id,p.score,p.category,p.reasons,draftReply(p,p.category),l.id,l.owner_id)
    }
    db.prepare("INSERT INTO x_acq_meta VALUES('scoring','rules-v3') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run()
  })
  return {setup,saveSettings,saveRule,list,detail,updateLead,collect,enqueue,overview,tick,start,ingest,budget,reserve,settle}
}
let instance
function service(){return instance||=createService(require('../db/connection'))}
module.exports={createService,service}
