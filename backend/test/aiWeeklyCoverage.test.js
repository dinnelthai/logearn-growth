'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFINITIONS,initialCoverage,collectWeeklyCoverage,finalizeWeeklyCoverage,
 modelCoverage}=require('../src/ai/growth/weeklyCoverage');

const period={start:1000,end:2000,previousStart:0,previousEnd:1000,timezone:'Asia/Bangkok'};
const baseline={id:'base-1',metricId:'active_users',value:71,
 period,coverage:{status:'partial'}};
const context=()=>({period,evidence:[baseline],business:{scope:{source:'all'}}});
const toolIds=DEFINITIONS.map(x=>x.tool);
test('all twelve modules are represented, missing sources are never marked analyzed',()=>{
 const result=initialCoverage(context(),{allowedTools:toolIds,availableSpecialties:[]});
 assert.equal(result.modules.length,12);
 assert.equal(new Set(result.modules.map(x=>x.id)).size,12);
 assert.equal(result.modules.find(x=>x.id==='growth-overview').status,'collected');
 assert.equal(result.modules.find(x=>x.id==='content-growth').status,'not-connected');
 assert.equal(result.modules.find(x=>x.id==='kol-impact').status,'not-investigated');
 assert.equal(result.modules.find(x=>x.id==='seo-organic').status,'not-investigated');
});
test('bounded only-read once-per-module collection keeps facts and source IDs',async()=>{
 const ctx=context(),calls=[];
 const outcome=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,
  availableSpecialties:['content-growth'],maxQueries:8,
  investigate:async({tool})=>{
   calls.push(tool);
   if(tool==='get_seo_performance')return {status:'ok',evidence:[{
    id:'seo-1',metricId:'seo_search',value:{metrics:{clicks:14,impressions:180}},
    coverage:{periodMatched:true}
   }]};
   if(tool==='get_retention')return {status:'unavailable',evidence:[]};
   return {status:'ok',evidence:[{
    id:'ev-'+tool,metricId:'funnel',value:{summary:{users:12,rate:.2}},
    coverage:{status:'partial'}
   }]};
  }});
 assert.equal(calls.length,8);
 assert.equal(new Set(calls).size,8);
 assert.equal(outcome.queries,8);
 assert.equal(outcome.modules.length,12);
 assert.equal(outcome.modules.find(x=>x.id==='seo-organic').status,'collected');
 assert.equal(outcome.modules.find(x=>x.id==='seo-organic').facts[0].value,14);
 assert.equal(outcome.modules.find(x=>x.id==='retention').status,'insufficient');
 assert.ok(ctx.evidence.some(x=>x.id==='seo-1'));
 assert.ok(outcome.modules.some(x=>x.status==='not-investigated'));
 const compact=modelCoverage(outcome);
 assert.equal(compact.length,12);
 assert.equal(JSON.stringify(compact).includes('impressions'),false);
});
test('unmatched SEO source stays insufficient, not falsely counted as weekly analyzed',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,maxQueries:1,
  investigate:async()=>({status:'ok',evidence:[{
   id:'seo-reference',metricId:'seo_search',
   value:{available:true,metrics:{clicks:8000}},
   coverage:{periodMatched:false}
  }]})});
 const record=out.modules.find(x=>x.id==='seo-organic');
 assert.equal(record.status,'insufficient');
 const final=finalizeWeeklyCoverage(out,{claims:[{evidenceIds:['seo-reference']}]});
 assert.equal(final.modules.find(x=>x.id==='seo-organic').status,'insufficient');
});
test('only an AI claim with recorded evidence promotes collected data to analyzed',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,maxQueries:1,
  investigate:async()=>({status:'ok',evidence:[{
   id:'seo-verified',metricId:'seo_search',
   value:{available:true,metrics:{clicks:14}},coverage:{periodMatched:true}
  }]})});
 const noClaims=finalizeWeeklyCoverage(out,{claims:[]});
 assert.equal(noClaims.modules.find(x=>x.id==='seo-organic').status,'collected');
 const claimed=finalizeWeeklyCoverage(out,{
  claims:[{kind:'fact',text:'有可验证搜索点击',evidenceIds:['seo-verified']}],
  suggestions:[{action:'下周核查有效搜索页面',
   evidence:{evidenceIds:['seo-verified']}}]
 });
 assert.equal(claimed.modules.find(x=>x.id==='seo-organic').status,'analyzed');
 assert.equal(claimed.modules.find(x=>x.id==='seo-organic').insight,'有可验证搜索点击');
 assert.equal(claimed.modules.find(x=>x.id==='seo-organic').nextAction,'下周核查有效搜索页面');
 assert.equal(claimed.counts.analyzed,1);
});
test('model investigations can fill an uninvestigated module without rerunning tools',()=>{
 const baselineManifest=initialCoverage(context(),{allowedTools:toolIds});
 const later=[{query:{tool:'get_kol_performance'},
  result:{status:'ok',evidence:[{id:'kol-3',metricId:'kol_performance',
   value:{summary:{users:5}}}]}}];
 const result=finalizeWeeklyCoverage(baselineManifest,
  {claims:[{text:'KOL归组观察存在',evidenceIds:['kol-3']}]},{additionalEvidence:later});
 assert.equal(result.modules.find(x=>x.id==='kol-impact').status,'analyzed');
 assert.deepEqual(result.modules.find(x=>x.id==='kol-impact').evidenceIds,['kol-3']);
});
test('query quota exhaustion does not create zero observations or a model retry',async()=>{
 const ctx=context();let calls=0;
 const result=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,
  maxQueries:8,investigate:async()=>{calls++;
   throw Object.assign(Error('query quota'),{status:429});
  }});
 assert.equal(calls,1);
 assert.equal(result.modules.find(x=>x.id==='seo-organic').status,'insufficient');
 assert.equal(result.modules.find(x=>x.id==='channel-growth').status,'not-investigated');
});

test('a successful but empty tool payload is not business evidence',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,
  maxQueries:1,investigate:async()=>({status:'ok',evidence:[{
   id:'no-real-metric',metricId:'seo_search',
   value:{available:true,metrics:{clicks:null,impressions:null}},
   coverage:{status:'unknown',periodMatched:true}
  }]})});
 assert.equal(out.modules.find(x=>x.id==='seo-organic').status,'insufficient');
});
