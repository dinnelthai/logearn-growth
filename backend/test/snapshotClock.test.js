const {test}=require('node:test'),assert=require('node:assert/strict')
// Deliberately emulate a source returning a corrupt future maximum as a second defense.
require('pg').Pool=class {
 on(){} async end(){} async query(sql,params){
  if(sql==='SELECT 1')return {rows:[{}]}
  assert.match(sql,/client_ts >= 0 AND client_ts <= EXTRACT\(EPOCH FROM \$1::timestamptz\)\*1000/)
  if(sql.includes('COUNT(*) AS n'))return {rows:[{n:1,start:Date.parse(params[0])-1000,latest:Date.parse(params[0])+365*86400000,source_seen:params[0]}]}
  return {rows:[]}
 }
}
const remote=require('../src/data/hologres')
test('a corrupt future source maximum never advances the snapshot as_of',async()=>{
 try{const s=await remote.status(true);assert.ok(Date.parse(s.as_of)<=Date.parse(s.snapshot_cutoff));assert.equal(s.snapshot_cutoff,s.last_success_at)}finally{await remote.close()}
})
