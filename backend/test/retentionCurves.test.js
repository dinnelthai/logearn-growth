const {test}=require('node:test'),assert=require('node:assert/strict')
const {computeRetentionCurves,resolveRetentionList,resolveCachedList,validateRetention}=require('../src/analytics/retentionCurves')
const {buildCohorts}=require('../src/analytics/retention')
const DAY=86400000,MON=Date.parse('2026-09-07T00:00:00+07:00')
const user=(id,d0,days=[],extra={})=>({id:'user:'+id,source:'direct',events:[{type:'chip',t:MON+d0*DAY+13*3600000},...days.map(p=>({type:'chip',t:MON+(d0+p)*DAY+1000}))],...extra})
const compute=(users,extra={})=>computeRetentionCurves(users,{start:MON,end:MON+7*DAY,asOf:MON+40*DAY,...extra})
const group=(r,id)=>Object.values(r.payload.curve_groups).flat().find(g=>g.id===id)
const point=(g,p)=>g.periods.find(x=>x.period===p)
test('calendar-day retention may rise, retries deduplicate and future returns never count',()=>{
 const a=user(1,0,[2,2,30,50]),r=compute([a],{maxDailyPeriods:30}),g=group(r,'daily:2026-09-07')
 assert.equal(point(g,0).retention_rate,1);assert.equal(point(g,1).retained_users,0);assert.equal(point(g,2).retained_users,1);assert.equal(point(g,2).continuous_retained_users,0);assert.equal(point(g,30).retained_users,1)
 assert.deepEqual(resolveRetentionList(r,'retention:'+g.id+':D2:returned'),['user:1'])
 assert.equal(validateRetention({maxDailyPeriods:30}),30);for(const n of [0,1,31,7.5,'invalid'])assert.throws(()=>validateRetention({maxDailyPeriods:n}),/观察长度/)
})
test('weekly points keep every member in the denominator and wait for the youngest member',()=>{
 const r=compute([user(1,0,[2]),user(2,1,[1])],{end:MON+2*DAY,asOf:MON+3*DAY+12*3600000}),g=group(r,'week:2026-09-07'),p=point(g,2)
 assert.equal(g.cohort_size,2);assert.equal(g.enrollment_complete,true);assert.equal(g.partial_calendar_group,true)
 assert.equal(point(g,1).retention_rate,.5);assert.equal(p.complete,false);assert.equal(p.retention_rate,null);assert.equal(p.eligible_users,1);assert.equal(p.pending_users,1)
 const lists=['returned','unobserved','pending'].map(s=>resolveRetentionList(r,p.list_prefix+':'+s));assert.deepEqual(lists,[['user:1'],[],['user:2']]);assert.equal(new Set(lists.flat()).size,g.cohort_size)
})
test('an enrolling week does not publish formal points even if some member days are mature',()=>{
 const r=compute([user(1,0,[1]),user(2,3)],{end:MON+7*DAY,asOf:MON+3*DAY+14*3600000}),g=group(r,'week:2026-09-07')
 assert.equal(g.enrollment_complete,false);assert(g.periods.every(p=>p.retention_rate===null));assert.equal(point(g,1).observed_returned_users,1)
 assert.deepEqual(resolveRetentionList(r,'retention:'+g.id+':D1:pending'),['user:2'])
})
test('partial first days use local midnight for D1 without dropping eligible users',()=>{
 const start=MON+12*3600000,users=[user(1,0,[1]),user(2,0,[],{events:[{type:'chip',t:MON+11*3600000}]})],r=compute(users,{start,end:MON+DAY,asOf:MON+3*DAY})
 const cohorts=buildCohorts(users,{startAt:start,endAt:MON+DAY,asOf:MON+3*DAY});assert.equal(cohorts[0].start,MON);assert.deepEqual(cohorts[0].users.map(u=>u.id),['user:1'])
 const g=group(r,'daily:2026-09-07');assert.equal(g.cohort_size,1);assert.equal(point(g,1).retention_rate,1)
})
test('D30 and continuous D30 are exact, including the half-open day boundary',()=>{
 const r=compute([user(1,0,Array.from({length:30},(_,i)=>i+1))],{maxDailyPeriods:30,asOf:MON+31*DAY}),g=group(r,'daily:2026-09-07')
 assert.equal(point(g,30).continuous_retention_rate,1);assert.deepEqual(resolveRetentionList(r,'retention:'+g.id+':C30:returned'),['user:1'])
 const pending=compute([user(1,0,[30])],{maxDailyPeriods:30,asOf:MON+31*DAY-1});assert.equal(point(group(pending,g.id),30).retention_rate,null)
})
test('historical first facts, source filtering and duplicate user rows do not change cohorts',()=>{
 const u=user(1,0,[1]),r=compute([u,{...u,events:[{type:'chip',t:MON+2*DAY}]}]);assert.equal(group(r,'week:2026-09-07').cohort_size,1)
 const older=user(2,0,[1],{first_analysis_at:MON-DAY}),source=user(3,0,[1],{source:'other'});assert.equal(compute([older]).payload.candidate_count,0);assert.equal(compute([source],{source:'direct'}).payload.candidate_count,0)
 assert.deepEqual(resolveCachedList(r,'cohort:2026-09-07'),['user:1']);assert.equal(resolveCachedList(r,'retention:daily:2026-09-07:D31:returned'),null)
})
test('the three lists partition each fixed batch and continuous complements match their own definition',()=>{
 const r=compute([user(1,0,[1,2]),user(2,1,[2]),user(3,2,[1])],{end:MON+3*DAY,asOf:MON+4*DAY}),g=group(r,'all:selected')
 for(const mode of ['D','C'])for(let p=0;p<=7;p++){const lists=['returned','unobserved','pending'].map(s=>resolveRetentionList(r,'retention:'+g.id+':'+mode+p+':'+s));assert.equal(lists.flat().length,g.cohort_size);assert.equal(new Set(lists.flat()).size,g.cohort_size)}
 assert.deepEqual(resolveRetentionList(r,'retention:all:selected:C2:returned'),['user:1']);assert.deepEqual(resolveRetentionList(r,'retention:all:selected:C2:unobserved'),['user:2'])
})
test('empty data does not generate a zero curve and drill lists are stored as compact masks',()=>{
 assert.deepEqual(compute([]).payload.curve_groups,{daily:[],week:[],all:[]})
 const r=compute(Array.from({length:1000},(_,i)=>user(i+1,i%7,[1,2,7])),{maxDailyPeriods:30});assert.equal(r.retention_store.users.length,1000);assert.equal(Object.keys(r.lists).length,0);assert(Buffer.byteLength(JSON.stringify(r))<250000)
})
test('remote daily compaction preserves the real first timestamp for partial-day enrollment',async()=>{
 const remote=require('../src/data/hologres'),original=remote.query;let params
 remote.query=async(_sql,p)=>{params=p;return [{user_key:'user:1',first_t:MON+13*3600000,source:'direct',days:[Math.floor((MON+25200000)/DAY),Math.floor((MON+DAY+25200000)/DAY)]}]}
 try{const rows=await require('../src/data/remoteUsers').retentionUsers({snapshot_cutoff:new Date(MON+40*DAY).toISOString(),as_of:new Date(MON+40*DAY).toISOString()},{start:MON+12*3600000,end:MON+DAY,maxDailyPeriods:30});assert.equal(rows[0].events[0].t,MON+13*3600000);assert.equal(rows[0].events.length,2);const r=compute(rows,{start:MON+12*3600000,end:MON+DAY,maxDailyPeriods:30});assert.equal(r.payload.candidate_count,1);assert.equal(point(group(r,'daily:2026-09-07'),1).retained_users,1);assert.equal(params[8],MON+31*DAY)}finally{remote.query=original}
})
test('lazy lists can be materialized for follow-on analysis with the same search and counts',()=>{
 const r=compute([user(1,0,[1]),user(2,0,[])]),{cachedAudience}=require('../src/analytics/taskAudience')
 assert.deepEqual(cachedAudience(r,'retention:daily:2026-09-07:D1:unobserved'),['user:2'])
 assert.deepEqual(cachedAudience(r,'retention:week:2026-09-07:cohort','user:1'),['user:1'])
 assert.deepEqual(cachedAudience(r,'retention:daily:2026-09-07:D1:unobserved','DIRECT'),['user:2'])
 assert.throws(()=>cachedAudience(r,'retention:week:2026-09-07:D30:pending'),/未知用户名单/)
})
