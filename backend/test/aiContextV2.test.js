'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {modelContext}=require('../src/ai/business/modelTransport');
const period={start:1792362000000,end:1792966800000,
 previousStart:1791757200000,previousEnd:1792362000000,timezone:'Asia/Bangkok'};
const evidence=i=>({
 id:'evidence-'+i,metricId:'active_users',unit:'users',value:120+i,
 numerator:200+i,denominator:300+i,sampleSize:300+i,period,
 sourceVersions:{events:'snapshot-v2'},
 watermarks:{events:'2026-10-29T00:00:00.000Z',
  eventsCompleteThrough:'2026-10-28T00:00:00.000Z'},
 coverage:{status:'partial',quality:'unknown'},
 warnings:['未确认完整历史；未观测并不表示零']
});
const schema={
 type:'object',additionalProperties:false,required:['start','end'],
 properties:{start:{type:'integer',minimum:0,maximum:2000000000000},
  end:{type:'integer',minimum:0,maximum:2000000000000},
  scope:{type:'object',properties:{source:{type:'string'}}},
  metrics:{type:'array',items:{type:'string'}},
  dimensions:{type:'array',items:{type:'string'}},
  limit:{type:'integer',minimum:1,maximum:100}}
};
const capabilities=Array.from({length:12},(_,i)=>({
 id:'get_tool_'+i,description:'Read-only statistical tool for authorized business scope',
 supportedScopes:['source'],inputSchema:schema
}));
const raw={business:{scope:{source:'all'}},period,
 definitions:{active_users:'观测到筹码分析的去重用户，不代表注册'},
 snapshot:{id:'snapshot'},current:{totals:{active_users:120}},
 previous:{totals:{active_users:110}},growth:{channels:[]},weekly:{available:true},
 candidates:[],capabilities,
 evidence:Array.from({length:30},(_,i)=>evidence(i))
};
test('v2 keeps more evidenced metrics in a smaller bounded model context',()=>{
 const before=modelContext(raw),after=modelContext(raw,{transportVersion:'v2'});
 const size=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 assert.equal(before.transportVersion,'aggregated-business-v1');
 assert.equal(after.transportVersion,'aggregated-business-v2');
 assert.ok(size(after)<size(before),'the v2 context should actually be smaller');
 assert.ok(after.evidence.length>=before.evidence.length);
 assert.ok(size(after)<=22000);
 assert.deepEqual(after.evidence.map(x=>x.id),
  Array.from({length:after.evidence.length},(_,i)=>'evidence-'+i));
 assert.ok(after.sharedEvidence?.watermarks);
 assert.ok(after.evidence.some(e=>e.shared?.includes('watermarks')));
 assert.equal(after.evidence[0].value,120);
 assert.equal(after.current.totals.active_users,120);
 assert.equal(after.previous.totals.active_users,110);
});
test('v2 tool specs remain callable but never expand authorized capabilities',()=>{
 const compact=modelContext(raw,{transportVersion:'v2'}).capabilities;
 assert.deepEqual(compact.map(x=>x.id),capabilities.map(x=>x.id));
 assert.equal(compact[0].input.start.type,'integer');
 assert.deepEqual(compact[0].required,['start','end']);
 assert.equal(compact[0].input.end.max,2000000000000);
 assert.equal(compact[0].supportedScopes[0],'source');
});
test('projection still drops private row-level fields and never converts unknown into zero',()=>{
 const report={...raw,evidence:[{...evidence(0),value:null,
  rows:[{user_id:'secret-user',wallet:'0x123'}]}]};
 const view=modelContext(report,{transportVersion:'v2'});
 assert.equal(view.evidence[0].value,null);
 assert.equal(JSON.stringify(view).includes('secret-user'),false);
});
test('unsupported model context protocol is rejected',()=>{
 assert.throws(()=>modelContext(raw,{transportVersion:'v9'}),/版本/);
});

test('v2 also supports an entirely empty evidence catalog',()=>{
 const projected=modelContext({...raw,evidence:[],capabilities:[]},{transportVersion:'v2'});
 assert.deepEqual(projected.evidence,[]);
 assert.equal(projected.evidenceMeta.total,0);
 assert.equal(projected.transportVersion,'aggregated-business-v2');
});
