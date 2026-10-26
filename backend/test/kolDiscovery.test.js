const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite')
const {createService,fingerprint}=require('../src/services/kolDiscovery'),{createService:createAcquisition}=require('../src/services/xAcquisition')
const {recommend,metrics,validateReview,username}=require('../src/analytics/kolProfiles')
const {cleanPost,cleanProfile}=require('../src/services/twitterAccounts')
const now=Date.now(),DAY=86400000
const posts=Array.from({length:14},(_,i)=>({id:String(100+i),text:'链上地址研究 '+i+' @otherCreator',createdAt:new Date(now-i*DAY).toISOString(),lang:'zh',viewCount:1000+i*100,likeCount:10,replyCount:3,retweetCount:1,isReply:false,retweeted_tweet:null,mentions:['otherCreator']}))
const profile={id:'200',userName:'Researcher',name:'研究员',description:'链上工具研究',followers:10000,following:100}
function review(){return {positioning:'研究型创作者',summary:'从地址和筹码解释任务',approach:'共创案例',risks:'样本有限',unknowns:'受众需求和合作价格未知',tags:['链上研究'],dimensions:{fit:{value:4.5,reason:'有具体分析',evidence_ids:['100','101','102']},research:{value:4,reason:'展示研究过程',evidence_ids:['100']},teaching:{value:4,reason:'有操作说明',evidence_ids:['101']},community:{value:null,reason:'未知社群组织能力',evidence_ids:[]},audience:{value:null,reason:'未采集评论者',evidence_ids:[]}}}}
function setup(provider){const db=new DatabaseSync(':memory:'),acquisition=createAcquisition(db,{configured:()=>true});return {db,s:createService(db,{acquisition,provider:provider||{profile:async()=>profile,timeline:async()=>({posts,has_next_page:false,next_cursor:''})}}),acquisition}}
const getRun=(db,id)=>db.prepare('SELECT * FROM x_kol_jobs WHERE id=?').get(id)
async function wait(db,id){for(let i=0;i<50;i++){const row=getRun(db,id);if(row.state!=='running')return row;await new Promise(r=>setTimeout(r,5))}throw Error('test job did not complete')}
test('target ranking distinguishes unknown from zero and excludes unreviewed, stale, changed or insufficient samples',()=>{
 const r=review(),base={review:r,posts,snapshotId:'a',reviewSnapshotId:'a',fetchedAt:now}
 const trial=recommend(base,'trial',now);assert.equal(trial.eligible,true);assert.equal(trial.coverage,90);assert.equal(trial.dimensions.find(d=>d.key==='audience').value,null);assert.ok(trial.score>70)
 assert.equal(recommend(base,'community',now).eligible,false)
 assert.equal(recommend({...base,review:null},'trial',now).score,null)
 assert.equal(recommend({...base,reviewSnapshotId:'old'},'trial',now).confidence,'needs_review')
 assert.equal(recommend({...base,fetchedAt:now-8*DAY},'trial',now).eligible,false)
 assert.equal(recommend({...base,posts:posts.slice(0,2)},'trial',now).score,null)
 assert.throws(()=>recommend(base,'unknown',now),{status:400})
})
test('sample metrics exclude replies, retweets, future and old posts, preserving unknown views',()=>{
 const m=metrics([...posts,{...posts[0],id:'300',isReply:true},{...posts[0],id:'301',retweeted_tweet:{id:'x'}},{...posts[0],id:'302',createdAt:new Date(now+DAY).toISOString()},{...posts[0],id:'303',createdAt:new Date(now-91*DAY).toISOString()}],now)
 assert.equal(m.original_posts,14);assert.equal(m.recent_posts,16);assert.equal(m.median_views,1650)
 assert.equal(metrics(posts.map(p=>({...p,viewCount:null})),now).median_views,null)
 assert.equal(fingerprint(posts),fingerprint([...posts].reverse()))
 assert.equal(fingerprint(posts),fingerprint(posts.map(p=>({...p,viewCount:9999}))))
})
test('reviews require cited current evidence and usernames cannot inject paths or arbitrary hosts',()=>{
 assert.equal(validateReview(review(),posts).dimensions.fit.value,4.5)
 const noEvidence=review();noEvidence.dimensions.fit.evidence_ids=[];assert.throws(()=>validateReview(noEvidence,posts),{status:400})
 const invented=review();invented.dimensions.fit.evidence_ids=['999'];assert.throws(()=>validateReview(invented,posts),{status:400})
 assert.equal(username('https://x.com/Researcher/'),'Researcher');assert.equal(username('@Researcher'),'Researcher')
 for(const value of ['https://evil.example/user','https://x.com/name/status/1','../../foo','https://x.com/i'])assert.throws(()=>username(value),{status:400})
})
test('account lifecycle isolates owners and versions, stores evidence, reranks by goal and discovers mentions without endorsement',()=>{
 const {db,s}=setup()
 try{
  const a=s.add('a',{username:'@Researcher'});assert.equal(s.add('a',{username:'researcher'}).id,a.id)
  assert.equal(s.list('a').summary.pending,1);assert.equal(s.list('a').accounts[0].rank,null)
  assert.throws(()=>s.detail('b',a.id),{status:404})
  const snapshot=s.storeSnapshot('a',a.id,profile,posts,now,'test')
  const current=s.detail('a',a.id).account
  const saved=s.saveReview('a',a.id,{review:review(),snapshot_id:snapshot,expected_updated_at:current.updated_at})
  assert.equal(saved.account.recommendation.eligible,true);assert.equal(s.list('a').accounts[0].rank,1)
  assert.equal(s.list('a',{objective:'community'}).accounts[0].rank,null)
  assert.throws(()=>s.saveFollowup('a',a.id,{stage:'shortlist',expected_updated_at:current.updated_at}),{status:409})
  const f=s.saveFollowup('a',a.id,{stage:'shortlist',notes:'先做产品验证',content:'计划人工沟通',expected_updated_at:saved.account.updated_at});assert.equal(f.account.stage,'shortlist');assert.equal(f.history.length,1)
  const candidates=s.candidates('a');assert.equal(candidates.candidates[0].username,'otherCreator');assert.ok(candidates.note.includes('不代表认可'))
  assert.equal(s.candidates('b').candidates.length,0)
  s.storeSnapshot('a',a.id,profile,posts.map(p=>({...p,viewCount:5000})),Date.now(),'refresh')
  assert.equal(s.detail('a',a.id).account.recommendation.eligible,true)
  s.storeSnapshot('a',a.id,profile,[...posts,{...posts[0],id:'900',text:'新内容'}],Date.now(),'refresh')
  const changed=s.detail('a',a.id);assert.equal(changed.account.recommendation.confidence,'needs_review');assert.equal(changed.account.recommendation.score,null);assert.equal(changed.account.stage,'shortlist');assert.equal(changed.account.notes,'先做产品验证');assert.equal(changed.evidence_posts.length,14)
  assert.throws(()=>s.saveReview('a',a.id,{review:review(),snapshot_id:snapshot,expected_updated_at:changed.account.updated_at}),{status:409})
 }finally{db.close()}
})
test('background refresh preserves snapshots on failure, uses shared lock, and recovers interrupted jobs',async()=>{
 let release,fail=false
 const gate=new Promise(r=>release=r)
 const {db,s}=setup({profile:async()=>{await gate;if(fail)throw Object.assign(Error('数据源暂不可用'),{status:502});return profile},timeline:async()=>({posts,has_next_page:false,next_cursor:''})})
 try{
  const a=s.add('a',{username:'Researcher'}),job=s.enqueue('a',a.id)
  assert.equal(job.state,'running');assert.throws(()=>s.enqueue('a',a.id),{status:409})
  release();assert.equal((await wait(db,job.id)).state,'complete')
  const before=s.detail('a',a.id).account.snapshot_id
  fail=true;const failed=s.enqueue('a',a.id);assert.equal((await wait(db,failed.id)).state,'failed');assert.equal(s.detail('a',a.id).account.snapshot_id,before)
  db.prepare("INSERT INTO x_acq_runs(id,owner_id,state,started_at) VALUES('restart','a','interrupted',?)").run(now)
  db.prepare("INSERT INTO x_kol_jobs(id,owner_id,account_id,state,started_at) VALUES('restart','a',?,'running',?)").run(a.id,now)
  s.list('a');assert.equal(getRun(db,'restart').state,'interrupted')
 }finally{release();db.close()}
})
test('provider projections keep only public profile and content fields and reject invalid identities',()=>{
 const p=cleanProfile({...profile,description:'',profile_bio:{description:'公开简介'},canDm:true});assert.equal(p.description,'公开简介');assert.equal(p.canDm,undefined)
 assert.throws(()=>cleanProfile({...profile,unavailable:true}),{status:502})
 const post=cleanPost({...posts[0],secret:'not persisted',author:{email:'not persisted'}});assert.equal(post.author,undefined);assert.equal(post.secret,undefined)
})
