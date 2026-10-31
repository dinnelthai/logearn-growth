const {test}=require('node:test'),assert=require('node:assert/strict')
const {growthInsights}=require('../src/analytics/growthInsights')
const DAY=86400000,start=Date.parse('2026-10-01T00:00:00+07:00'),end=start+3*DAY
const row=(id,extra={})=>({user_key:'user:'+id,first_seen_at:start,first_chip_at:null,current_active:false,previous_active:false,source:'x',chip_days:[],first_day_hours:0,...extra})
const run=(rows,asOf,evidence={})=>growthInsights(rows,[],{start,end},{as_of:new Date(asOf).toISOString()},undefined,evidence)
test('registration cohort includes accounts with no events and remains separate from first observed users',()=>{
 const registration={available:true,scope:'all',rows:[{user_key:'user:2',source:'未知',registered_at:start,first_chip_at:null},{user_key:'user:3',registered_at:start,first_chip_at:start+DAY-1},{user_key:'user:4',registered_at:start,first_chip_at:start+DAY},{user_key:'user:5',registered_at:end-1,first_chip_at:null}]}
 const result=run([row(1,{first_seen_at:start-100*DAY})],end,{registration}),c=result.payload.cohorts
 assert.equal(c.observed.users,0);assert.equal(c.registration.metrics.users,4);assert.equal(c.registration.metrics.eligible,3);assert.equal(c.registration.metrics.activated,1);assert.equal(c.registration.metrics.pending,1)
 assert.deepEqual(result.lists['cohort:registered:activated'],['user:3']);assert.equal(result.members['user:2'].id,'user:2')
 assert.equal(run([],end).payload.cohorts.registration.metrics,null)
})
test('cross-midnight revisit is not a 24 hour revisit and immature successes stay outside mature numerator',()=>{
 const first=start+DAY-60000,rows=[row(1,{first_chip_at:first,first_later_day_at:first+120000,first_after_24h_at:null}),row(2,{first_chip_at:first,first_later_day_at:first+DAY,first_after_24h_at:first+DAY}),row(3,{first_chip_at:first,first_later_day_at:first+7*DAY,first_after_24h_at:first+7*DAY})]
 let r=run(rows,first+2*DAY).payload.cohorts.repeats
 assert.equal(r[0].eligible,0);assert.equal(r[0].rate,null);assert.equal(r[0].observed_returned,2);assert.equal(r[0].returned,0);assert.equal(r[1].observed_returned,1)
 r=run(rows,first+7*DAY-1).payload.cohorts.repeats
 assert.equal(r[0].eligible,3);assert.equal(r[0].returned,2);assert.equal(r[1].returned,1);assert.equal(r[1].pending,0)
})
test('diagnostic user counts are exact family totals, never summed over overlapping version groups',()=>{
 const coverage={available:true,rows:[{scope:'family',family:'analysis',users:1,events:1000},{scope:'device_version',family:'analysis',device:'desktop',users:1},{scope:'device_version',family:'analysis',device:'mobile',users:1}]}
 const q=run([],end,{coverage}).payload.quality
 assert.equal(q.families[0].users,1);assert.equal(q.families[1].users,0);assert.equal(q.diagnostic_coverage.rows.length,3)
})

test('registered cohort trade conversion starts after first analysis and uses mature verified accounts',()=>{
 const registration={available:true,scope:'all',rows:[
  {user_key:'user:2',source:'未知',registered_at:start,first_chip_at:null},
  {user_key:'user:3',registered_at:start,first_chip_at:start+3600000},
  {user_key:'user:4',registered_at:start,first_chip_at:start+DAY},
  {user_key:'user:5',registered_at:end-1,first_chip_at:null}
 ]};
 const facts={known:new Set(['user:3','user:4']),error:null,trades:[
  {account_id:'3',transaction_hash:'tx3',chain:'3',valid:true,
   transaction_time:new Date(start+3600000+DAY).toISOString(),trade_value:'12'}
 ]};
 const result=growthInsights([] ,[],{start,end},{as_of:new Date(end+40*DAY).toISOString()},facts,{registration});
 const trade=result.payload.cohorts.registration.trade;
 assert.equal(result.payload.cohorts.registration.metrics.users,4);
 assert.equal(result.payload.cohorts.registration.metrics.activated,1);
 assert.equal(trade.engaged,2);
 assert.equal(trade.eligible,2);
 assert.equal(trade.traders,1);
 assert.equal(trade.conversion_rate,.5);
 assert.equal(trade.not_engaged,2);
 assert.equal(trade.pending,0);
 assert.equal(trade.association,'user-level-after-first-analysis');
});

test('registered trade cohort excludes first chip analysis outside its registration seven-day entry window',()=>{
 const registration={available:true,scope:'all',rows:[
  {user_key:'user:20',registered_at:start,first_chip_at:start+7*DAY-1},
  {user_key:'user:21',registered_at:start,first_chip_at:start+7*DAY},
  {user_key:'user:22',registered_at:start,first_chip_at:start+8*DAY},
  {user_key:'user:23',registered_at:start,first_chip_at:start+DAY},
  {user_key:'user:24',registered_at:start,first_chip_at:null}
 ]};
 const asOf=end+40*DAY;
 const facts={known:new Set(['user:20','user:21','user:22','user:23']),
  error:null,trades:[
   {account_id:'20',transaction_hash:'t20',chain:'3',valid:true,
    transaction_time:new Date(start+7*DAY+DAY).toISOString(),trade_value:'4'},
   {account_id:'21',transaction_hash:'t21',chain:'3',valid:true,
    transaction_time:new Date(start+8*DAY).toISOString(),trade_value:'4'},
   {account_id:'22',transaction_hash:'t22',chain:'3',valid:true,
    transaction_time:new Date(start+9*DAY).toISOString(),trade_value:'4'}
  ]};
 const out=growthInsights([],[],{start,end},{as_of:new Date(asOf).toISOString()},facts,
  {registration}).payload.cohorts.registration;
 assert.equal(out.engagement.eligible,5);
 assert.equal(out.engagement.chip_analysis_users,2);
 assert.equal(out.trade.engaged,2);
 assert.equal(out.trade.not_engaged,3);
 assert.equal(out.trade.eligible,2);
 assert.equal(out.trade.traders,1);
 assert.equal(out.trade.conversion_rate,.5);
 assert.deepEqual(out.trade.association,'user-level-after-first-analysis');
});

test('registered source groups reconcile mature 24h activation and parallel seven-day product counts without identities',()=>{
 const registration={available:true,scope:'all',rows:[
  {user_key:'user:1',source:'x',registered_at:start,first_chip_at:start+1000,
   first_holder_at:start+3000,first_strategy_at:null,first_signal_at:null,first_repeat_chip_at:null},
  {user_key:'user:2',source:'x',registered_at:start,first_chip_at:null,
   first_holder_at:start+DAY,first_strategy_at:start+DAY,first_signal_at:null,first_repeat_chip_at:null},
  {user_key:'user:3',source:'未知',registered_at:start,first_chip_at:start+DAY,
   first_holder_at:null,first_strategy_at:null,first_signal_at:start+2*DAY,first_repeat_chip_at:null},
  {user_key:'user:4',source:'https://private.example.test/account',registered_at:start,
   first_chip_at:null,first_holder_at:null,first_strategy_at:null,first_signal_at:null,first_repeat_chip_at:null},
  {user_key:'user:5',source:'direct',registered_at:start+DAY*2,first_chip_at:start+DAY*2+2000,
   first_holder_at:null,first_strategy_at:null,first_signal_at:null,first_repeat_chip_at:null}
 ]};
 const observed=run([],start+8*DAY,{registration}).payload.cohorts.registration;
 const groups=observed.bySource, x=groups.find(g=>g.source==='x'),
  missing=groups.find(g=>g.source==='unknown'),other=groups.find(g=>g.source==='other'),
  direct=groups.find(g=>g.source==='direct');
 assert.equal(groups.reduce((n,g)=>n+g.users,0),observed.metrics.users);
 assert.equal(groups.reduce((n,g)=>n+g.activation.eligible,0),observed.metrics.eligible);
 assert.equal(groups.reduce((n,g)=>n+g.engagement.eligible,0),observed.engagement.eligible);
 assert.equal(x.users,2);assert.equal(x.activation.activated,1);assert.equal(x.activation.rate,.5);
 assert.equal(x.engagement.eligible,2);assert.equal(x.engagement.chip_analysis_users,1);
 assert.equal(x.engagement.holder_view_users,2);
 assert.equal(x.engagement.strategy_started_users,1);
 assert.equal(missing.users,1);assert.equal(missing.activation.activated,0);
 assert.equal(missing.engagement.chip_analysis_users,1);
 assert.equal(other.users,1);assert.equal(other.activation.activated,0);
 assert.equal(direct.users,1);assert.equal(direct.engagement.eligible,0);
 assert.equal(direct.engagement.pending,1);
 assert.doesNotMatch(JSON.stringify(groups),/user:|https?:\/\/|private\.example/);
});

test('registered observed-source grouping is bounded and conserves population in overflow',()=>{
 const sources=['x','youtube','telegram','reddit','seo','direct','未知','account:secret'];
 const registration={available:true,scope:'all',rows:sources.map((source,i)=>({
  user_key:'user:'+(i+1),source,registered_at:start,first_chip_at:null
 }))};
 const result=run([],start+10*DAY,{registration}).payload.cohorts.registration;
 const groups=result.bySource;
 assert.ok(groups.length<=6);
 assert.equal(groups.reduce((n,g)=>n+g.users,0),8);
 assert.equal(groups.find(g=>g.source==='unknown').users,1);
 assert.equal(groups.find(g=>g.source==='other').users,3);
 assert.ok(groups.every(g=>/^[a-z][a-z0-9_-]*$/.test(g.source)));
 assert.doesNotMatch(JSON.stringify(groups),/account:secret/);
});
