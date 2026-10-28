const test=require('node:test'),assert=require('node:assert/strict');
const {checkHealth,aiSchemaReady}=require('../src/ai/business/health');
test('health separates infrastructure failures and never calls a model',async()=>{
 const result=await checkHealth({api:async()=>true,dataSource:async()=>true,redis:async()=>{throw Error('secret connection string')},worker:async()=>false,aiDatabase:async()=>true,migrations:async()=>false,modelConfig:async()=>true});
 assert.equal(result.components.redis.status,'unavailable');assert.equal(result.components.worker.status,'unavailable');assert.equal(result.components.migrations.status,'unavailable');
 assert.equal(result.components.modelConfig.status,'ok');assert.equal(result.ready,false);assert.doesNotMatch(JSON.stringify(result),/secret/);
});

test('migration readiness fails closed for a legacy AI usage log schema',async()=>{
 const captured=[];
 const db={query:async(sql,params)=>{
  captured.push({sql,params});
  return {rows:[{records:'ai_analysis_records',suggestions:'ai_suggestions',
   usage_logs:'ai_usage_logs',trace_index:null,
   usage_columns:['cost_known']}]};
 }};
 assert.equal(await aiSchemaReady(db),false);
 assert.ok(captured[0].sql.includes('idx_ai_usage_owner_trace'));
 assert.deepEqual(captured[0].params,[['trace_id','round','cost_known']]);
});
test('migration readiness requires the complete usage schema, not just tables',async()=>{
 const base={records:'ai_analysis_records',suggestions:'ai_suggestions',
  usage_logs:'ai_usage_logs',trace_index:'idx_ai_usage_owner_trace',
  usage_columns:['trace_id','round','cost_known']};
 const mock=value=>({query:async()=>({rows:[value]})});
 assert.equal(await aiSchemaReady(mock(base)),true);
 for(const missing of ['trace_id','round','cost_known']){
  assert.equal(await aiSchemaReady(mock({...base,usage_columns:
   base.usage_columns.filter(x=>x!==missing)})),false,missing);
 }
 assert.equal(await aiSchemaReady(mock({...base,usage_logs:null})),false);
 assert.equal(await aiSchemaReady(mock({})),false);
});
