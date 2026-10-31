const {test}=require('node:test'),assert=require('node:assert/strict')
const {growthInsights,validateGrowth,interval}=require('../src/analytics/growthInsights')
const DAY=86400000,start=Date.parse('2026-09-01T00:00:00+07:00'),end=start+7*DAY,asOf=start+40*DAY
const day=t=>Math.floor((t+25200000)/DAY)
const snapshot={as_of:new Date(asOf).toISOString(),snapshot_cutoff:new Date(asOf+100).toISOString(),latest_event_at:new Date(asOf).toISOString()}
const row=(id,extra={})=>({user_key:'user:'+id,first_seen_at:start,first_chip_at:start,source:'x',device:'desktop',app_version:'v1',current_active:false,previous_active:false,chip_days:[],first_day_hours:1,first_day_strategy:false,...extra})
test('mutually exclusive lifecycle groups reconcile exact user changes and every dimension',()=>{
 const rows=[row(1,{current_active:true}),row(2,{current_active:true,previous_active:true,first_chip_at:start-DAY}),row(3,{current_active:true,first_chip_at:start-10*DAY,source:'direct'}),row(4,{previous_active:true,first_chip_at:start-2*DAY}),row(5,{user_key:'anonymous:a',previous_active:true,first_chip_at:start-2*DAY}),row(6)]
 const out=growthInsights(rows,[],{start,end},snapshot),c=out.payload.change
 assert.deepEqual(c,{current:3,previous:3,fresh:1,resumed:1,continuing:1,absent:2,delta:0,rate:0,actionable:1})
 assert.deepEqual(out.lists['growth:absent:registered'],['user:4'])
 assert.equal(c.current,c.fresh+c.resumed+c.continuing)
 assert.equal(c.delta,c.fresh+c.resumed-c.absent)
 for(const groups of Object.values(out.payload.dimensions)){assert.equal(groups.reduce((n,r)=>n+r.delta,0),c.delta);for(const r of groups)assert.equal(out.lists[r.list_key+':current'].length,r.current)}
 assert.equal(out.payload.quality.history_complete,false)
})
test('24 hour conversion and natural-day D7/D30 use mature denominators and strict window boundaries',()=>{
 const asOf=end-1,s={...snapshot,as_of:new Date(asOf).toISOString()}
 const rows=[row(1,{first_chip_at:start+DAY-1,chip_days:[day(start)+7,day(start)+30]}),row(2,{first_seen_at:end-1000,first_chip_at:end-1}),row(3,{first_chip_at:start+DAY})]
 const a=growthInsights(rows,[],{start,end},s).payload.channels[0]
 assert.equal(a.users,3);assert.equal(a.eligible,2);assert.equal(a.activated,1);assert.equal(a.pending,1);assert.equal(a.d7.eligible,0);assert.equal(a.d7.rate,null)
 const b=growthInsights(rows,[],{start,end},snapshot).payload.channels[0]
 assert.equal(b.d7.eligible,3);assert.equal(b.d7.returned,1);assert.equal(b.d30.eligible,3);assert.equal(b.d30.returned,1)
})
test('elapsed current period sets equal previous duration without future population or zero baselines',()=>{
 const s={...snapshot,as_of:new Date(start+DAY-1).toISOString()}
 const out=growthInsights([row(1,{current_active:true})],[],{start,end},s).payload
 assert.equal(out.end,start+DAY);assert.equal(out.previous_start,start-DAY);assert.equal(out.change.rate,null)
 assert.throws(()=>growthInsights([],[],{start:end,end:end+DAY},s),/尚未到达/)
})
test('cohort trade is restricted to mature verified users and the first 168 hours, unknown source never becomes zero',()=>{
 const rows=[row(1),row(2),row(3,{user_key:'anonymous:a'}),row(4,{first_chip_at:null})],trade=(extra={})=>({account_id:'1',transaction_hash:'h',chain:'3',valid:true,transaction_time:new Date(start+DAY).toISOString(),trade_value:'-12.5',...extra})
 const facts={known:new Set(['user:1']),error:null,trades:[
  trade(),trade({transaction_time:new Date(start-DAY).toISOString(),trade_value:900}),
  trade({transaction_time:new Date(start+7*DAY).toISOString(),trade_value:500}),
  trade({valid:false}),trade({trade_value:null})
 ]}
 const out=growthInsights(rows,[],{start,end},snapshot,facts),t=out.payload.channels[0].trade
 assert.equal(t.eligible,1);assert.equal(t.unmatched,2);assert.equal(t.traders,1);assert.equal(t.transactions,2);assert.equal(t.volume_usd,null);assert.equal(t.missing_values,1);assert.equal(t.excluded_trades,1)
 assert.equal(t.conversion_rate,1);assert.equal(t.pending,0);assert.equal(t.not_engaged,1);
 assert.equal(t.association,'user-level-after-first-analysis')
 assert.deepEqual(out.lists[t.list_key+':traders'],['user:1'])
 const missing=growthInsights(rows,[],{start,end},snapshot).payload.channels[0].trade
 assert.equal(missing.available,false);assert.equal(missing.traders,null);assert.equal(missing.volume_usd,null)
})
test('quality separates absent telemetry from actual zero and preserves safe version evidence',()=>{
 const quality=[{event_name:'analysis_requested',version:'v2',events:'4',linked_events:'3',missing_source_events:'2',missing_id_events:'1',first_at:start,latest_at:end-1}]
 const q=growthInsights([],quality,{start,end},snapshot).payload.quality
 assert.equal(q.events,4);assert.equal(q.linked_rate,.75);assert.equal(q.source_rate,.5)
 assert.equal(q.families[0].available,true);assert.equal(q.families[0].missing_id_events,1);assert.equal(q.families[1].available,false)
 assert.equal(q.versions[0].version,'v2');assert.equal(q.events_complete_through,null)
})
test('behavior groups use separate D7 mature denominators and Wilson intervals handle small/empty samples',()=>{
 const rows=[row(1,{first_day_strategy:true,chip_days:[day(start)+7]}),row(2,{first_day_strategy:false})]
 const a=growthInsights(rows,[],{start,end},snapshot).payload.associations[0]
 assert.equal(a.groups[0].d7.rate,1);assert.equal(a.groups[1].d7.rate,0)
 assert.equal(interval(0,0),null);assert(interval(1,1)[0]<1);assert(interval(0,1)[1]>0)
 for(const b of [{start,end:start+32*DAY},{start:-1,end},{start,end,source:[]},{start:1.5,end}])assert.throws(()=>validateGrowth(b))
 validateGrowth({start,end})
})
