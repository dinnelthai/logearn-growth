const {test}=require('node:test')
const assert=require('node:assert/strict')
const {DatabaseSync}=require('node:sqlite')
const {createService}=require('../src/services/xAcquisition')
const {scorePost,SEEDS}=require('../src/analytics/xAcquisition')
const provider=require('../src/services/twitterApi')
const fixture=(id='100',author='200',text='How do I check token holders? Looking for an analysis tool.')=>({id,text,createdAt:new Date().toISOString(),lang:'en',likeCount:3,replyCount:1,author:{id:author,userName:'researcher',name:'Researcher',description:'Onchain research',followers:30}})
function service(search){const db=new DatabaseSync(':memory:');return {db,s:createService(db,{search,configured:()=>true})}}
test('intent scoring preserves evidence and demotes promotional posts',()=>{
 const need=scorePost(fixture());assert.ok(need.score>=60);assert.equal(need.category,'need');assert.ok(need.reasons.some(r=>r.evidence))
 const noise=scorePost(fixture('1','2','Token holders analysis tool giveaway airdrop guaranteed profit'));assert.ok(noise.score<60);assert.equal(noise.category,'noise')
 assert.equal(scorePost(fixture('1','2','Good morning everyone')).category,'other')
 assert.ok(scorePost(fixture('1','2','Our tool now offers holder distribution. How to use it?')).score<60)
 assert.ok(scorePost(fixture('1','2','Why does this matter? Token holders can track distribution over time.')).score<60)
 assert.ok(scorePost(fixture('1','2','我花了很久思考工具怎么设计，你将终身获得聪明钱追踪。')).score<60)
 assert.ok(scorePost(fixture('1','2','Looking forward to wallet tracking updates')).score<60)
 assert.ok(scorePost(fixture('1','2','机构持仓出炉，怎么看这些筹码？分析一下美股。')).score<60)
})
test('collect merges authors and evidence; manual follow-up survives later collection; owners and versions are protected',async()=>{
 let number=0
 const {s,db}=service(async args=>{const id=args.beforeAttempt();args.settleAttempt(id,30);number++;return {tweets:[fixture('100'),fixture(number===1?'101':'102')],has_next_page:false,next_cursor:''}})
 try{
  s.setup('a');s.setup('b');assert.equal(s.overview('a').rules.length,SEEDS.length);assert.equal(s.overview('a').settings.enabled,0)
  const rule=s.overview('a').rules[0]
  const run=await s.collect('a',{rule_id:rule.id});assert.equal(run.state,'complete');assert.equal(run.new_leads,1);assert.equal(run.posts,2)
  const lead=s.list('a').leads[0];assert.equal(lead.post_count,2);assert.equal(s.list('b').total,0)
  assert.throws(()=>s.detail('b',lead.id),{status:404})
  assert.throws(()=>s.saveRule('b',rule.id,{name:'x',query:'x'}),{status:404})
  assert.throws(()=>s.updateLead('a',lead.id,{stage:'trial',expected_updated_at:lead.updated_at}),{status:400})
  const saved=s.updateLead('a',lead.id,{stage:'contacted',notes:'实际沟通',assignee:'运营',content:'已人工回复原帖',next_followup_at:Date.now()-100,expected_updated_at:lead.updated_at})
  assert.equal(saved.followups.length,1);assert.equal(s.overview('a').due,1)
  assert.throws(()=>s.updateLead('a',lead.id,{stage:'trial',expected_updated_at:lead.updated_at}),{status:409})
  await s.collect('a',{rule_id:rule.id});const updated=s.detail('a',lead.id)
  assert.equal(updated.posts.length,3);assert.equal(updated.lead.stage,'contacted');assert.equal(updated.lead.notes,'实际沟通')
  assert.equal(s.list('a',{rule_id:rule.id,q:'Looking',stage:'contacted',high:'1'}).total,1)
  assert.equal(s.list('a',{due:'1'}).total,1)
  assert.equal(s.overview('a').budget.estimated_usd,0.0006)
  assert.ok(updated.lead.tracking_url.includes('utm_content='+lead.id))
  const trial=s.updateLead('a',lead.id,{stage:'trial',content:'对方回复已完成一次分析，尚未关联站内行为',expected_updated_at:updated.lead.updated_at});assert.equal(trial.lead.stage,'trial')
 }finally{db.close()}
})
test('bounded pagination resumes fixed window, preserves completed watermark and resets after query edits',async()=>{
 const calls=[]
 const {s,db}=service(async args=>{calls.push(args);const id=args.beforeAttempt();args.settleAttempt(id,15);const n=calls.length;return {tweets:[fixture(String(100+n))],has_next_page:n<4,next_cursor:n<4?'c'+n:''}})
 try{
  const r=s.saveRule('a',null,{name:'test',query:'"token holders" tool'})
  const first=await s.collect('a',{rule_id:r.id});assert.equal(first.state,'partial');assert.equal(first.pages,3)
  const pending=s.overview('a').rules[0];assert.equal(pending.cursor,'c3');assert.equal(pending.complete_until,null)
  const next=await s.collect('a',{rule_id:r.id});assert.equal(next.state,'complete');assert.equal(calls[3].cursor,'c3');assert.equal(calls[3].query,calls[0].query)
  const done=s.overview('a').rules[0];assert.ok(done.complete_until);assert.equal(done.cursor,'')
  const changed=s.saveRule('a',r.id,{name:'changed',query:'筹码 工具',expected_updated_at:done.updated_at});assert.equal(changed.complete_until,null)
  assert.throws(()=>s.saveRule('a',r.id,{name:'stale',query:'tool',expected_updated_at:done.updated_at}),{status:409})
 }finally{db.close()}
})
test('budget is shared across owners, reserves retry uncertainty and stops before another request',async()=>{
 const previous=process.env.X_ACQUISITION_DAILY_USD;process.env.X_ACQUISITION_DAILY_USD='0.003'
 let calls=0
 const {s,db}=service(async args=>{args.beforeAttempt();calls++;throw Object.assign(Error('数据源暂不可用'),{status:502})})
 try{
  const a=s.saveRule('a',null,{name:'a',query:'holders tool'}),b=s.saveRule('b',null,{name:'b',query:'holders tool'})
  assert.equal((await s.collect('a',{rule_id:a.id})).state,'failed')
  assert.equal((await s.collect('b',{rule_id:b.id})).state,'failed')
  assert.equal(calls,1);assert.equal(s.budget().uncertain_usd,0.003);assert.equal(s.budget().remaining_credits,0)
 }finally{if(previous===undefined)delete process.env.X_ACQUISITION_DAILY_USD;else process.env.X_ACQUISITION_DAILY_USD=previous;db.close()}
})
test('only one paid collector may run; failed page can replay without losing evidence',async()=>{
 let release
 const waiting=new Promise(resolve=>release=resolve)
 const {s,db}=service(async args=>{await waiting;const id=args.beforeAttempt();args.settleAttempt(id,15);return {tweets:[fixture()],has_next_page:false,next_cursor:''}})
 try{
  const r=s.saveRule('a',null,{name:'a',query:'holder tool'}),task=s.collect('a',{rule_id:r.id})
  await assert.rejects(s.collect('a',{rule_id:r.id}),{status:409})
  assert.throws(()=>s.saveRule('a',r.id,{name:'a',query:'wallet',expected_updated_at:r.updated_at}),{status:409})
  release();await task;assert.equal(s.list('a').total,1)
 }finally{release();db.close()}
})
test('restart recovers interrupted run; automatic collection respects opt-in and interval',async()=>{
 let calls=0
 const {s,db}=service(async args=>{calls++;const id=args.beforeAttempt();args.settleAttempt(id,15);return {tweets:[],has_next_page:false,next_cursor:''}})
 try{
  const settings=s.setup('a');await s.tick();assert.equal(calls,0)
  s.saveSettings('a',{enabled:true,interval_minutes:30,expected_updated_at:settings.updated_at})
  await s.tick();assert.equal(calls,SEEDS.length);await s.tick();assert.equal(calls,SEEDS.length)
  db.prepare("INSERT INTO x_acq_runs(id,owner_id,state,started_at) VALUES('stuck','a','running',?)").run(Date.now())
  const stop=s.start();stop();assert.equal(s.overview('a').running,false);assert.equal(db.prepare("SELECT state FROM x_acq_runs WHERE id='stuck'").get().state,'interrupted')
 }finally{db.close()}
})
test('provider authenticates only to fixed destination, validates schema and hides upstream secrets',async()=>{
 const previous=process.env.TWITTERAPI_IO_API_KEY;process.env.TWITTERAPI_IO_API_KEY='test-secret'
 try{
  let credits=0
  const result=await provider.search({query:'holder tool',beforeAttempt:()=>1,settleAttempt:(_id,n)=>credits=n,fetchImpl:async(url,options)=>{
   assert.equal(url.origin,'https://api.twitterapi.io');assert.equal(url.searchParams.get('queryType'),'Latest');assert.equal(options.headers['X-API-Key'],'test-secret')
   return {ok:true,json:async()=>({tweets:[fixture()],has_next_page:false})}
  }})
  assert.equal(result.tweets.length,1);assert.equal(credits,15)
  await assert.rejects(provider.search({query:'x',fetchImpl:async()=>({ok:false,status:401,json:async()=>({message:'test-secret'})})}),e=>e.message==='数据源密钥无效'&&!e.message.includes('test-secret'))
  await assert.rejects(provider.search({query:'x',fetchImpl:async()=>({ok:true,json:async()=>({status:'error',msg:'test-secret'})})}),e=>e.message.includes('响应异常')&&!e.message.includes('test-secret'))
  await assert.rejects(provider.search({query:'x',fetchImpl:async()=>({ok:true,json:async()=>({tweets:[{...fixture(),author:null}],has_next_page:false})})}),e=>e.message.includes('字段不完整'))
 }finally{if(previous===undefined)delete process.env.TWITTERAPI_IO_API_KEY;else process.env.TWITTERAPI_IO_API_KEY=previous}
})
