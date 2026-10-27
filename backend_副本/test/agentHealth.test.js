const test=require('node:test'),assert=require('node:assert/strict');
const {checkHealth}=require('../src/ai/business/health');
test('health separates infrastructure failures and never calls a model',async()=>{
 const result=await checkHealth({api:async()=>true,dataSource:async()=>true,redis:async()=>{throw Error('secret connection string')},worker:async()=>false,aiDatabase:async()=>true,migrations:async()=>false,modelConfig:async()=>true});
 assert.equal(result.components.redis.status,'unavailable');assert.equal(result.components.worker.status,'unavailable');assert.equal(result.components.migrations.status,'unavailable');
 assert.equal(result.components.modelConfig.status,'ok');assert.equal(result.ready,false);assert.doesNotMatch(JSON.stringify(result),/secret/);
});
