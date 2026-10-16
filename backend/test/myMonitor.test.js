const {test}=require('node:test')
const assert=require('node:assert/strict')
const {computeMyMonitor,dayStart}=require('../src/analytics/myMonitor')
const DAY=86400000,start=Date.parse('2026-10-01T00:00:00+07:00'),end=start+DAY
const record=(id,extra={})=>({id,first_seen:start,first_page:start,first_login:start+100,first_manual_login:start+100,first_chip:start+200,pages:[start],starts:[start+50],logins:[start+100],manual_logins:[start+100],trials:[start+150],analyses:[start+200],...extra})
const calc=(rows,extra={})=>computeMyMonitor(rows,{start,end,asOf:start+10*DAY,...extra})
test('period counts are unique per identity, conversion is ordered within 24h',()=>{
 const {metrics:m}=calc([record('a'),record('b',{first_chip:start+DAY+1,analyses:[start+DAY+1]}),record('old',{first_seen:start-DAY,first_chip:start-DAY,analyses:[]})])
 assert.equal(m.activation.denominator,2);assert.equal(m.activation.numerator,1)
 assert.equal(m.visit_login.denominator,3);assert.equal(m.login_analysis.denominator,2)
 assert.equal(m.login_analysis.numerator,2) // b completes within 24h of login
 assert.equal(m.trial.rate,1)
})
test('first analysis before login does not count and later repeat is not first',()=>{
 const {metrics:m}=calc([record('a',{first_chip:start-1,analyses:[start+200]})])
 assert.equal(m.activation.numerator,0);assert.equal(m.login_analysis.denominator,0)
})
test('conversion after 24h is excluded, zero denominator is null',()=>{
 const {metrics:m}=calc([record('a',{logins:[start+DAY+1],manual_logins:[start+DAY+1],first_login:start+DAY+1,first_manual_login:start+DAY+1,trials:[]})])
 assert.equal(m.visit_login.numerator,0);assert.equal(m.trial.rate,null)
})
test('D1/D7 require complete business days and exclude immature cohort',()=>{
 const r=record('a',{pages:[start,start+DAY+500,start+7*DAY+500]})
 let m=calc([r],{asOf:start+7*DAY+1000}).metrics
 assert.equal(m.d1.rate,1);assert.equal(m.d7.denominator,0);assert.equal(m.d7.pending,1)
 m=calc([r],{asOf:start+8*DAY-1}).metrics;assert.equal(m.d7.rate,1)
 assert.equal(dayStart(start+DAY-1),start)
})
test('missing collection shows unavailable rather than false zero',()=>{
 const m=calc([record('a')],{availability:{pages:false,trial:false}}).metrics
 assert.equal(m.activation.rate,null);assert.equal(m.trial.available,false)
 assert.equal(m.login_success.rate,1)
})
test('daily buckets do not add repeat visits into period unique denominator',()=>{
 const r=record('a',{pages:[start,start+DAY+10]})
 const out=calc([r],{end:start+2*DAY})
 assert.equal(out.metrics.visit_login.denominator,1)
 assert.equal(out.days[0].metrics.visit_login.denominator,1)
 assert.equal(out.days[1].metrics.visit_login.denominator,1)
})
test('SQLite identity merge, anonymous login evidence, dedup and exclusions',()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:')
 db.exec("CREATE TABLE events(event_id TEXT,event_name TEXT,user_id TEXT,anonymous_id TEXT,client_ts INTEGER,server_ts TEXT,properties TEXT DEFAULT '{}')")
 const put=db.prepare('INSERT INTO events(event_id,event_name,user_id,anonymous_id,client_ts,server_ts) VALUES(?,?,?,?,?,?)')
 for(const row of [['p','page_viewed',null,'anon',start],['l','login_succeeded','42','anon',start+100],['c','chip_analysis_drilldown','42','anon',start+200],['p','page_viewed',null,'anon',start],['bad','page_viewed','acc_test','staff',start],['anon_login','login_succeeded',null,'unlinked',start]])put.run(...row,'2026-10-01')
 db.prepare("UPDATE events SET properties=? WHERE event_id='l'").run(JSON.stringify({login_type:'manual'}))
 const out=require('../src/data/myMonitorLocal').myMonitorLocal(db,{start,end,asOf:start+10*DAY})
 assert.equal(out.metrics.activation.denominator,1);assert.equal(out.metrics.activation.rate,1)
 assert.equal(out.metrics.login_analysis.denominator,1)
 assert.equal(out.metrics.trial.available,false)
 db.close()
})
test('only explicit manual login enters conversion; restore and unknown remain separate user/event counts',()=>{
 const auto=record('auto',{manual_logins:[],first_manual_login:null,auto_logins:[start+100,start+110],unknown_logins:[]})
 const unknown=record('unknown',{manual_logins:[],first_manual_login:null,unknown_logins:[start+100]})
 const manual=record('manual',{manual_logins:[start+100,start+120],auto_logins:[start+130]})
 const r=calc([auto,unknown,manual]);assert.equal(r.metrics.visit_login.numerator,1);assert.equal(r.metrics.login_analysis.denominator,1);assert.equal(r.metrics.login_success.numerator,1);assert.equal(r.metrics.trial.denominator,1)
 assert.deepEqual(r.login_breakdown.map(x=>[x.type,x.users,x.events]),[['manual',1,2],['auto_restore',2,3],['unknown',1,1]])
 assert.deepEqual(r.days[0].login_breakdown,r.login_breakdown)
})
