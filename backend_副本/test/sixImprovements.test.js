process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path'),db=require('../src/db/connection'),remote=require('../src/data/hologres'),jobs=require('../src/services/analysisJobs')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const now=Date.now(),start=now-86400000,end=now+1
for(const [id,owner]of [['k','a'],['foreign','b']])db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,id,'X',1,1)
db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report,tag_version) VALUES(?,?,?,?,?,?,?,?)').run('activity','a','Activity',start,end,'s','{}',1)
let touchRows=[],analysisDown=false
remote.status=async()=>({snapshot_id:'s',snapshot_cutoff:new Date(now).toISOString(),as_of:new Date(now).toISOString()})
remote.query=async(sql,p)=>{if(sql.includes("LIKE '%le_link=%'"))return touchRows;if(sql.includes('SELECT account_id::text'))return p[1].map(account_id=>({account_id}));if(sql.includes('SELECT event_id,SUBSTRING')){if(analysisDown)throw Error('analysis down');return [{event_id:'before',user_id:'1',t:start+1},{event_id:'after',user_id:'1',t:now-1}]}if(sql.includes('trade_groups'))return [{chain:'eth',transaction_hash:'hash',account_id:'1',transaction_time:new Date(now-1).toISOString(),trade_value:10,valid:true}];return []}
let jobValue=null;jobs.result=(id,owner)=>{if(owner!=='a'||id!=='job')throw Object.assign(Error('Forbidden'),{status:404});return jobValue}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/crm',require('../src/routes/crm'));app.use('/promotions',require('../src/routes/promotions'));app.use(require('../src/routes/audienceHistory'));app.use('/cohorts',require('../src/routes/cohorts'));app.use(require('../src/routes/remoteAnalytics'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function req(url,body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('revenue ledger uses exact amounts, refunds, unique receipts, revisions and frozen financial reports',async()=>{
 const {revenueTotals}=require('../src/analytics/collaborationRevenue'),{amountText}=require('../src/analytics/collaborationCosts');assert.equal(amountText(-1,'USD'),'-0.01');assert.equal(revenueTotals([],[{currency:'USD',state:'received',kind:'income',amount_minor:100}])[0].profit,null)
 assert.deepEqual(revenueTotals([{currency:'USD',state:'actual',amount_minor:100}],[])[0].roi,null)
 const c=(await req('/crm/k/collaborations',{name:'Finance',start_at:start,end_at:end,status:'active'})).body.collaboration,base='/crm/k/collaborations/'+c.id
 await req(base+'/costs',{category:'service',currency:'USD',amount:'10.00',state:'actual',description:'cost',occurred_at:now,expected_revision:1})
 const income={currency:'USD',amount:'20.10',kind:'income',state:'received',reference:'receipt-1',description:'paid service',occurred_at:now,expected_revision:2}
 assert.equal((await req(base+'/revenues',income,undefined,'b')).status,404)
 assert.equal((await req(base+'/revenues',{...income,amount:'1.001'})).status,400)
 const saved=await req(base+'/revenues',income);assert.equal(saved.status,201)
 assert.equal((await req(base+'/revenues',{...income,expected_revision:3})).status,409)
 await req(base+'/revenues',{...income,amount:'0.10',kind:'refund',reference:'refund-1',expected_revision:3})
 let d=(await req(base)).body;assert.equal(d.revenue_totals[0].net_revenue,'20.00');assert.equal(d.revenue_totals[0].profit,'10.00');assert.equal(d.revenue_totals[0].roi,1)
 assert.equal((await req(base,{status:'completed',review:'verified receipts',expected_revision:4},'PATCH')).status,200)
 assert.equal((await req(base+'/revenues/'+saved.body.id,{...income,state:'void',expected_revision:5},'PATCH')).status,409)
 await req(base,{status:'active',expected_revision:5},'PATCH')
 await req(base+'/revenues/'+saved.body.id,{...income,state:'void',expected_revision:6},'PATCH')
 d=(await req(base)).body;assert.equal(d.revenue_totals[0].profit,'-10.10');assert.equal((await req(base+'/reports/1')).body.report.revenue_totals[0].profit,'10.00')
})
test('tag journal captures actual membership deltas and isolates owners and user filters',async()=>{
 db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run('k','1');db.prepare('INSERT OR IGNORE INTO crm_kol_members VALUES(?,?)').run('k','1');db.prepare('INSERT INTO growth_activity_tags VALUES(?,?,?)').run('activity','2',now);db.prepare('DELETE FROM crm_kol_members WHERE kol_id=? AND user_id=?').run('k','1')
 const h=(await req('/user-tags/history?user_id=1')).body;assert.equal(h.total,2);assert.equal(h.history[0].action,'remove');assert.equal((await req('/user-tags/history',undefined,'GET','b')).body.total,0)
 assert.equal((await req('/user-tags/history?offset=-1')).status,400)
})
test('cohort versions are server-derived, preserve empty dynamic results, deduplicate jobs and report deltas',async()=>{
 const c=(await req('/cohorts',{name:'Static',user_ids:['1','2']})).body.cohort
 const v=await req('/cohorts/'+c.id+'/versions',{});assert.equal(v.body.count,2)
 await req('/cohorts/'+c.id+'/members',{user_ids:['2']},'DELETE');const next=await req('/cohorts/'+c.id+'/versions',{});assert.equal(next.body.removed,1)
 assert.equal((await req('/cohorts/'+c.id+'/versions/'+v.body.id)).body.ids.length,2);assert.equal((await req('/cohorts/'+c.id+'/versions',undefined,'GET','b')).status,404)
 const rule={version:1,days:7,pool:'registered',filters:{},source:'all',tag_ids:[],tag_mode:'all',base_ids:null},dynamic=(await req('/cohorts',{name:'Dynamic',kind:'dynamic',rule})).body.cohort,stored=db.prepare('SELECT rule_json FROM cohorts WHERE id=?').get(dynamic.id)
 jobValue={j:{snapshot:'s',context:{mode:'segments',cohort_id:'forged',cohort_rule:stored.rule_json}},value:{lists:{all:[]}}}
 assert.equal((await req('/cohorts/'+dynamic.id+'/versions',{cache_id:'job'})).status,409)
 jobValue.j.context.cohort_id=dynamic.id;const empty=await req('/cohorts/'+dynamic.id+'/versions',{cache_id:'job'});assert.equal(empty.body.count,0)
 assert.equal((await req('/cohorts/'+dynamic.id+'/versions',{cache_id:'job'})).body.id,empty.body.id)
 assert.deepEqual((await req('/cohorts/'+dynamic.id+'/versions/'+empty.body.id)).body.ids,[])
})
test('promotion URLs preserve target params, attribution deduplicates owner links and excludes pre-touch facts',async()=>{
 const {promotionUrl,attributeTouches}=require('../src/analytics/promotionAttribution'),tags={utm_source:'kol',utm_medium:'social',utm_campaign:'october'}
 assert.throws(()=>promotionUrl('javascript:alert(1)','id',tags));assert.throws(()=>promotionUrl('https://u:p@example.com','id',tags))
 const r=await req('/promotions',{name:'Link',kol_id:'k',url:'https://logearn.com/token?chain=eth',...tags});assert.equal(r.status,201);const l=r.body.link,u=new URL(l.url);assert.equal(u.searchParams.get('chain'),'eth');assert.equal(u.searchParams.get('le_link'),l.id)
 assert.equal((await req('/promotions',{name:'private',kol_id:'foreign',url:'https://logearn.com',...tags})).status,404)
 // Use a deterministic earlier creation time for this read-only fixture.
 db.prepare('UPDATE promotion_links SET created_at=? WHERE id=?').run(start,l.id)
 touchRows=[{event_id:'touch',user_key:'user:1',t:start+100,url:l.url},{event_id:'repeat',user_key:'user:1',t:start+200,url:l.url},{event_id:'anonymous',user_key:'anonymous:a',t:start+100,url:l.url},{event_id:'wrong-host',user_key:'user:2',t:start+100,url:l.url.replace('logearn.com','other.com')}]
 const report=await req('/promotions/'+l.id+'/report',{start,end});assert.equal(report.body.observed_visitors,2);assert.equal(report.body.performance.total.analysis_events,1);assert.equal(report.body.performance.total.transactions,1);assert.equal(report.body.anonymous_visitors,1)
 assert.equal((await req('/promotions/'+l.id+'/report',{start,end},undefined,'b')).status,404)
 analysisDown=true;const unknown=await req('/promotions/'+l.id+'/report',{start,end});assert.equal(unknown.body.performance.total.analysis_events,null);analysisDown=false
 assert.equal(attributeTouches([...touchRows,{event_id:'earlier',user_key:'user:1',t:start+50,url:l.url.replace(l.id,'second')}],[{...l,created_at:start},{...l,id:'second',url:l.url.replace(l.id,'second'),created_at:start}]).find(t=>t.user_key==='user:1').id,'second')
})

test('dynamic resolution overrides client filters, base roster and time using the owner-saved rule',async()=>{
 const rule={version:1,days:7,pool:'registered',filters:{task:'analysis_no_trade'},source:'all',tag_ids:[],tag_mode:'all',base_ids:['user:1']},c=(await req('/cohorts',{name:'Rules',kind:'dynamic',rule})).body.cohort
 let captured;const original=jobs.start;jobs.start=(kind,body,s,audience,owner)=>{captured={kind,body,s,audience,owner};return {id:'queued',state:'queued'}}
 try{const result=await req('/api/metrics/segments',{resolving_cohort_id:c.id,start:1,end:2,pool:'observed',filters:{},audience_ids:null,resolving_cohort_rule:'forged'});assert.equal(result.status,202);assert.deepEqual(captured.audience,['user:1']);assert.equal(captured.body.pool,'registered');assert.deepEqual(captured.body.filters,rule.filters);assert.notEqual(captured.body.start,1);assert.equal(captured.body.end,now+1);assert.notEqual(captured.body.resolving_cohort_rule,'forged');assert.equal((await req('/api/metrics/segments',{resolving_cohort_id:c.id,start:1,end:2},undefined,'b')).status,404)}finally{jobs.start=original}
})
