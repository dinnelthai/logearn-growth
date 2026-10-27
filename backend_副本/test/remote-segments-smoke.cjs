// Local authenticated API integration using a temporary session, removed on completion.
const assert=require('node:assert/strict'),db=require('../src/db/connection'),{randomBytes}=require('node:crypto')
const token=randomBytes(32).toString('hex'),operator=db.prepare('SELECT id FROM users LIMIT 1').get()
const base=process.env.SMOKE_BASE_URL||'http://localhost:3001'
async function request(path,body){
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};let response=await fetch(base+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})}),data=await response.json(),deadline=Date.now()+45000
 assert(response.ok,path+": "+JSON.stringify(data))
 while(response.status===202){assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,250));response=await fetch(base+'/api/analytics/jobs/'+data.job_id,{headers});data=await response.json();assert(response.ok,path+": "+JSON.stringify(data))}
 return data
}
async function main(){
 db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(token,operator.id,Date.now(),Date.now()+120000)
 try{
 const meta=await request('/api/analytics/meta'),end=Date.parse(meta.as_of)+1,start=end-7*86400000
 const refreshed=await request('/api/analytics/refresh',{});assert.notEqual(refreshed.snapshot_id,meta.snapshot_id)
 assert.equal((await request('/api/analytics/meta')).snapshot_id,refreshed.snapshot_id)
 const all=await request('/api/metrics/segments',{start,end,pool:'registered'})
 assert(all.registered_total>6000);assert.equal(all.total,all.registered_total)
 assert.equal(all.comparison.reduce((n,g)=>n+g.users,0),all.total)
 assert.equal(all.registration_cohorts.reduce((n,g)=>n+g.users,0),all.total)
 assert.equal(all.summary.d7_rate,null)
 const group=all.segments.find(r=>r.segment==='未观测分析'),drill=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:all.drill.cache_id,list_key:group.list_key},limit:2})
 assert.equal(drill.total,group.users);assert.equal(drill.rows.length,2);assert(drill.rows.every(r=>r.registered&&r.created_at&&r.first_chip_at==null))
 const business=await request('/api/metrics/segments',{start,end,pool:'business'})
 assert(business.total>0&&business.total<all.total);assert.equal(business.total,business.business_total)
 const businessDrill=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:business.drill.cache_id,list_key:'all'},limit:200})
 assert.equal(businessDrill.total,business.total);assert(businessDrill.rows.every(r=>r.business_signal))
 const checks=[['period:analysis',business.summary.analysis_users],['period:strategy',business.summary.strategy_users],['period:trade',business.summary.trade_users],['period:login',business.summary.login_users],['period:new',business.summary.new_users],['nft',business.focus.nft_users],['balance',business.focus.positive_balance_users]]
 for(const row of business.comparison)for(const [suffix,field]of [['analysis','analysis_users'],['strategy','strategy_users'],['trade','trade_users']])checks.push([row.list_key+':'+suffix,row[field]])
 for(const row of business.registration_cohorts.slice(0,3))checks.push([row.list_key+':analysis',row.analysis_users],[row.list_key+':unobserved',row.users-row.analysis_users])
 await Promise.all(checks.map(async([key,total])=>{const result=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:business.drill.cache_id,list_key:key},limit:2});assert.equal(result.total,total,key)}))
 const contact=await request('/api/metrics/segments',{start,end,pool:'contact_only'})
 assert.equal(business.business_total+business.contact_only_total+business.no_signal_total,all.total)
 assert.equal(contact.total,business.contact_only_total)
 const filtered=await request('/api/metrics/segments',{start,end,filters:{binding:'both',trade:'repeat'},group_by:'registration'})
 const fd=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:filtered.drill.cache_id,list_key:'all'},limit:200})
 assert.equal(fd.total,filtered.total);assert(fd.rows.every(r=>r.telegram_bound&&r.email_bound&&r.trade_count>=2))
 const unmatched=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:all.drill.cache_id,list_key:'unmatched'},limit:2})
 assert.equal(unmatched.total,all.unmatched_users);assert(unmatched.rows.every(r=>!r.registered&&r.email_bound==null))
 const absent=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:all.drill.cache_id,list_key:'all'},q:'no-such-account-xyz',limit:2});assert.equal(absent.total,0)
 const funnel=await request('/api/metrics/funnel',{start,end,steps:['logged_in_visit','token','chip'],hours:24})
 const funnelDrill=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:funnel.drill.cache_id,list_key:'reached:0'},limit:2})
 assert.equal(funnelDrill.total,funnel.steps[0].users)
 const retention=await request('/api/metrics/retention',{start,end})
 if(retention.daily.length){const co=retention.daily[0],rd=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:retention.drill.cache_id,list_key:'cohort:'+co.cohort_date},limit:2});assert.equal(rd.total,co.cohort_size)}
 const invalid=await fetch(base+'/api/metrics/segments',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({filters:{status:'invalid'}})});assert.equal(invalid.status,400)
 assert.equal((await fetch(base+'/api/metrics/segments',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401)
 console.log(JSON.stringify({passed:true,registered:all.total,business:business.total,focus:business.focus,unmatched:all.unmatched_users,comparison_groups:all.comparison.length,registration_cohorts:all.registration_cohorts.length,filtered:filtered.total,summary:all.summary}))
 }finally{db.prepare('DELETE FROM sessions WHERE token=?').run(token)}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
