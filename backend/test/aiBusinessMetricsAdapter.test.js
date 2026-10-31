const {test}=require('node:test')
const assert=require('node:assert/strict')
const evidence=require('../src/data/businessEvidence')
const {metrics}=require('../src/ai/business/tools/adapters')

test('registered_users uses account creation facts and preserves a true zero',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'all',metrics:{users:0,eligible:0,activated:0,pending:0,rate:null}
  }}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registered_users'],{})
  assert.equal(result.metrics[0].value,0)
  assert.equal(result.coverage.registrations,'all')
  assert.match(result.metrics[0].warnings.join(' '),/account_v2\.created_at/)
  assert.doesNotMatch(result.metrics[0].warnings.join(' '),/未知不能解释为0/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('registered_users and new_users remain separate source facts',async()=>{
 const oldGrowth=evidence.fetchGrowthInsights,oldNorth=evidence.fetchNorthStar
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'all',metrics:{users:2,eligible:2,activated:1,pending:0,rate:.5}
  }}})
  evidence.fetchNorthStar=async()=>({totals:{new_users:5}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},
   ['registered_users','new_users'],{})
  assert.deepEqual(result.metrics.map(x=>x.value),[2,5])
 }finally{
  evidence.fetchGrowthInsights=oldGrowth;evidence.fetchNorthStar=oldNorth
 }
});
test('registered_users remains unknown when registration facts are unavailable',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:false,scope:'all',metrics:null,error:'registration facts unavailable'
  }}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registered_users'],{})
  assert.equal(result.metrics[0].value,null)
  assert.equal(result.coverage.registrations,'unknown')
  assert.match(result.metrics[0].warnings.join(' '),/未知不能解释为0/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('source-specific registration counts disclose observed-source attribution limits',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'observed_source',metrics:{users:12,eligible:8,activated:6,pending:2,rate:.75}
  }}})
  const result=await metrics({start:100,end:200,source:'x'},{snapshot_id:'s'},['registered_users'],{})
  assert.equal(result.metrics[0].value,12)
  assert.equal(result.coverage.registrations,'observed_source')
  assert.match(result.metrics[0].warnings.join(' '),/未归因账户不会计入该来源/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('registration activation rate reports the mature denominator and pending registrations',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{available:true,scope:'all',metrics:{
   users:14,eligible:10,activated:5,pending:4,rate:.5
  }}}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registration_activation_rate'],{})
  const value=result.metrics[0]
  assert.equal(value.value,.5)
  assert.equal(value.numerator,5)
  assert.equal(value.denominator,10)
  assert.equal(value.sampleSize,10)
  assert.equal(value.pending,4)
  assert.match(value.warnings.join(' '),/仅已成熟注册队列进入分母/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('registration activation is unknown when no registrations have matured, not zero percent',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{available:true,scope:'all',metrics:{
   users:3,eligible:0,activated:0,pending:3,rate:null
  }}}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registration_activation_rate'],{})
  const value=result.metrics[0]
  assert.equal(value.value,null)
  assert.equal(value.numerator,0)
  assert.equal(value.denominator,0)
  assert.equal(value.pending,3)
  assert.match(value.warnings.join(' '),/不是0%/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('registered trade conversion uses mature identity-matched accounts and discloses unmatched users',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{available:true,scope:'all',trade:{
   available:true,eligible:12,traders:3,conversion_rate:.25,pending:4,not_engaged:7,unmatched:2
  }}}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registered_trade_conversion_rate'],{})
  const value=result.metrics[0]
  assert.equal(value.value,.25)
  assert.equal(value.numerator,3)
  assert.equal(value.denominator,12)
  assert.equal(value.pending,4)
  assert.equal(value.notEngaged,7)
  assert.equal(value.unmatched,2)
  assert.match(value.warnings.join(' '),/不是同Token交易归因/)
  assert.equal(result.coverage.trades,'post_analysis_user_level')
 }finally{evidence.fetchGrowthInsights=original}
})

test('registered trade conversion stays unknown when trade facts are unavailable',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{available:true,scope:'all',trade:{
   available:false,eligible:null,traders:null,conversion_rate:null,pending:1,not_engaged:2,unmatched:null
  }}}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registered_trade_conversion_rate'],{})
  assert.equal(result.metrics[0].value,null)
  assert.equal(result.metrics[0].denominator,null)
  assert.equal(result.coverage.trades,'unknown')
  assert.match(result.metrics[0].warnings.join(' '),/未知不能解释为0/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('metric-specific coverage reports registration and trade uncertainty independently',async()=>{
 const original=evidence.fetchGrowthInsights;
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'observed_source',
   metrics:{users:3,eligible:2,activated:1,pending:1,rate:.5},
   trade:{available:false,eligible:null,traders:null,conversion_rate:null}
  }}});
  const out=await metrics({start:100,end:200,source:'x'},
   {snapshot_id:'event-snapshot'},[
    'registered_users','registration_activation_rate','registered_trade_conversion_rate'],{});
  const [registered,activated,traded]=out.metrics;
  assert.equal(registered.value,3);
  assert.equal(registered.coverage.status,'partial');
  assert.match(registered.coverage.reason,/已观测归因/);
  assert.equal(activated.value,.5);
  assert.equal(activated.coverage.status,'partial');
  assert.match(activated.coverage.reason,/事件覆盖和注册水位/);
  assert.equal(traded.value,null);
  assert.equal(traded.coverage.status,'unavailable');
  assert.match(traded.coverage.reason,/不能解释为零/);
  assert.equal(out.coverage.registrations,'observed_source');
  assert.equal(out.coverage.trades,'unknown');
 }finally{evidence.fetchGrowthInsights=original}
});

test('registered user journey exposes 24h activation, parallel 7d product entries and separate trade conversion',async()=>{
 const original=evidence.fetchGrowthInsights;
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'all',
   metrics:{users:20,eligible:16,activated:8,pending:4,rate:.5},
   engagement:{eligible:12,pending:5,chip_analysis_users:9,holder_view_users:6,
    strategy_started_users:4,signal_view_users:7,repeat_analysis_users:3},
   trade:{available:true,engaged:10,eligible:8,unmatched:2,traders:3,
    conversion_rate:3/8,pending:2,not_engaged:6,
    association:'user-level-after-first-analysis'}
  }},quality:{history_complete:false}});
  const result=await metrics({start:100,end:200,source:'all'},
   {snapshot_id:'events-v1',as_of:'2026-10-20T00:00:00Z'},
   ['registered_user_journey'],{});
  const row=result.metrics[0],journey=row.value.registration;
  assert.equal(row.metricId,'registered_user_journey');
  assert.equal(row.coverage.status,'partial');
  assert.equal(journey.users,20);
  assert.equal(journey.activation.eligible,16);
  assert.equal(journey.activation.activated,8);
  assert.equal(journey.activation.rate,.5);
  assert.equal(journey.engagement.eligible,12);
  assert.equal(journey.engagement.chip_analysis_users,9);
  assert.equal(journey.engagement.chip_analysis_rate,.75);
  assert.equal(journey.engagement.holder_view_rate,.5);
  assert.equal(journey.engagement.strategy_started_rate,4/12);
  assert.equal(journey.engagement.signal_view_rate,7/12);
  assert.equal(journey.engagement.repeat_analysis_rate,.25);
  assert.equal(journey.trade.eligible,8);
  assert.equal(journey.trade.traders,3);
  assert.equal(journey.trade.conversion_rate,3/8);
  assert.match(journey.engagement.definition,/入口之间允许重叠/);
  assert.match(journey.definition,/并行产品入口/);
  assert.ok(row.warnings.some(x=>x.includes('不能相加或画成串行漏斗')));
  assert.ok(row.warnings.some(x=>x.includes('真实环境验收')));
 }finally{evidence.fetchGrowthInsights=original}
});

test('registered user journey keeps immature, unavailable and zero-denominator facts distinct',async()=>{
 const original=evidence.fetchGrowthInsights;
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'all',
   metrics:{users:3,eligible:0,activated:0,pending:3,rate:null},
   engagement:{eligible:0,pending:3,chip_analysis_users:0,holder_view_users:0,
    strategy_started_users:0,signal_view_users:0,repeat_analysis_users:0},
   trade:{available:false,eligible:null,traders:null,conversion_rate:null,
    pending:1,not_engaged:2,unmatched:null}
  }}});
  const result=await metrics({start:100,end:200,source:'all'},
   {snapshot_id:'events-v1'},['registered_user_journey'],{});
  const value=result.metrics[0].value.registration;
  assert.equal(value.users,3);
  assert.equal(value.activation.rate,null);
  assert.equal(value.activation.eligible,0);
  assert.equal(value.engagement.eligible,0);
  assert.equal(value.engagement.chip_analysis_users,0);
  assert.equal(value.engagement.chip_analysis_rate,null);
  assert.equal(value.trade.available,false);
  assert.equal(value.trade.eligible,null);
  assert.equal(value.trade.traders,null);
  assert.equal(value.trade.conversion_rate,null);
  assert.ok(result.metrics[0].warnings.some(x=>x.includes('交易转化未知而非零')));
 }finally{evidence.fetchGrowthInsights=original}
});

test('registered user journey stays unavailable when registration facts cannot be read',async()=>{
 const original=evidence.fetchGrowthInsights;
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:false,scope:'all',metrics:null,error:'offline'
  }}});
  const result=await metrics({start:100,end:200,source:'all'},
   {snapshot_id:'events-v1'},['registered_user_journey'],{});
  assert.equal(result.metrics[0].value.available,false);
  assert.equal(result.metrics[0].value.registration.available,false);
  assert.equal(result.metrics[0].coverage.status,'unavailable');
 }finally{evidence.fetchGrowthInsights=original}
});
