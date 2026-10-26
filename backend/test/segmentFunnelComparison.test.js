const {test}=require('node:test'),assert=require('node:assert/strict')
const {options,prepareComparison,compareFunnels}=require('../src/analytics/segmentFunnelComparison')
const job={id:'base',snapshot:'fixed',context:{mode:'segments',source:'all'}}
const value={lists:{'group:0':['user:1','user:2'],'group:1':['user:2','user:3']},payload:{start:1000,end:10000,comparison:[{list_key:'group:0',label:'A'},{list_key:'group:1',label:'B'}]}}
const body={group_keys:['group:0','group:1'],preset:'analysis',hours:1}
test('comparison uses authoritative groups and period, deduplicates overlap and ignores forged membership',()=>{
 const out=prepareComparison({...body,start:0,end:1,groups:[{ids:['user:999']}],audience_ids:['user:999']},job,value)
 assert.deepEqual(out.audience,['user:1','user:2','user:3']);assert.equal(out.body.start,1000);assert.equal(out.body.end,10000)
 assert.equal(out.body.base_cache_id,'base');assert.deepEqual(out.body.groups.map(g=>g.label),['A','B'])
 assert.equal(out.body.association,'user');assert.deepEqual(out.body.steps,['logged_in_visit','token','chip'])
 assert.throws(()=>prepareComparison(body,{...job,context:{mode:'referral'}},value),{status:400})
 assert.throws(()=>prepareComparison({...body,group_keys:['all','group:0']},job,{...value,lists:{...value.lists,all:['user:999']}}),{status:400})
 assert.throws(()=>prepareComparison({...body,group_keys:['group:0','group:0']},job,value),{status:400})
 assert.throws(()=>prepareComparison({...body,association:'token_visit'},job,value),{status:400})
 assert.throws(()=>options({...body,hours:12}),{status:400})
 const large={...value,lists:{...value.lists,'group:0':Array.from({length:5001},(_,i)=>'user:'+i)}}
 assert.throws(()=>prepareComparison(body,job,large),{status:422})
})
test('group funnel counts and exact drill lists agree with overlapping fixed membership',()=>{
 const e=(type,t)=>({type,t}),users=[
 {id:'user:1',events:[e('logged_in_visit',2000),e('token',3000),e('chip',4000)]},
 {id:'user:2',events:[e('logged_in_visit',2000)]},
 {id:'user:3',events:[e('token',3000)]},
 {id:'user:999',events:[e('logged_in_visit',2000),e('token',3000),e('chip',4000)]},
 ]
 const b=prepareComparison(body,job,value).body,r=compareFunnels(users,b,{as_of:new Date(7200000).toISOString()})
 assert.equal(r.payload.pool_users,3)
 const [a,c]=r.payload.groups;assert.equal(a.pool_users,2);assert.equal(a.entered,2);assert.equal(a.converted,1)
 assert.deepEqual(r.lists[a.stages[2].reached.list_key],['user:1'])
 assert.deepEqual(r.lists[a.stages[0].unobserved.list_key],['user:2'])
 assert.equal(c.entered,1);assert.equal(c.converted,0);assert.deepEqual(r.lists[c.missing_start.list_key],[])
 for(const group of r.payload.groups)for(const stage of group.stages)for(const cell of [stage.reached,stage.pending,stage.unobserved])assert.equal(cell.count,r.lists[cell.list_key].length)
 assert(!JSON.stringify(r).includes('user:999'))
 const pending=compareFunnels(users,b,{as_of:new Date(20000).toISOString()}).payload.groups[0]
 assert.equal(pending.stages[0].pending.count,1);assert.equal(pending.stages[0].unobserved.count,0)
})
test('empty groups remain empty and business association presets retain quality distinctions',()=>{
 const empty={...value,lists:{'group:0':[],'group:1':[]}},prepared=prepareComparison({...body,preset:'token_visit'},job,empty)
 assert.equal(prepared.body.association,'token_visit');assert.deepEqual(prepared.audience,[])
 const result=compareFunnels([],prepared.body,{as_of:new Date(20000).toISOString()})
 assert.equal(result.payload.pool_users,0);assert(result.payload.groups.every(g=>g.entered===0&&g.converted===0))
})
