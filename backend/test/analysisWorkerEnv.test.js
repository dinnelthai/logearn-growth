const {test}=require('node:test')
const assert=require('node:assert/strict')
const {analysisWorkerEnv}=require('../src/services/analysisWorkerEnv')
test('the analysis worker has capacity for four parallel Hologres points scans',()=>{
 const parent={PG_POOL_MAX:'1',PG_CONNECT_TIMEOUT_MS:'3000',PGHOST:'private.example'}
 const child=analysisWorkerEnv(parent)
 assert.equal(child.PG_POOL_MAX,'4')
 assert.equal(child.PG_CONNECT_TIMEOUT_MS,'10000')
 assert.equal(child.PGHOST,'private.example')
 assert.deepEqual(parent,{PG_POOL_MAX:'1',PG_CONNECT_TIMEOUT_MS:'3000',PGHOST:'private.example'})
})
test('a higher intentional timeout or bounded worker pool size is retained',()=>{
 const child=analysisWorkerEnv({PG_ANALYSIS_WORKER_POOL_MAX:'6',PG_CONNECT_TIMEOUT_MS:'15000'})
 assert.equal(child.PG_POOL_MAX,'6')
 assert.equal(child.PG_CONNECT_TIMEOUT_MS,'15000')
 assert.equal(analysisWorkerEnv({PG_ANALYSIS_WORKER_POOL_MAX:'999'}).PG_POOL_MAX,'8')
 assert.equal(analysisWorkerEnv({PG_ANALYSIS_WORKER_POOL_MAX:'1'}).PG_POOL_MAX,'4')
})
