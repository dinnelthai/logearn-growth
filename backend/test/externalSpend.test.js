'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reserveExternalSpend,bangkokDay}=require('../src/ai/business/tools/externalSpend');
const args={ownerId:'alice',workspaceId:'growth',connectionId:'openseo:alice',
 capabilityId:'openseo.keyword_research',taskId:'task-a',executionToken:'lease-token',
 callKey:'stable-call-hash',reserveMicrousd:60000,now:Date.parse('2026-10-29T04:00:00Z')};
function fixture({enabled=true,used=0,eligible=true,duplicate=false,limit=100000}={}){
 const statements=[],client={query:async(sql,params)=>{
  statements.push({sql,params});
  if(sql.includes('FROM ai_analysis_records'))return {rows:eligible?[{id:'task-a'}]:[]};
  if(sql.includes('FROM ai_external_spend_policy'))return {rows:[{
   enabled,currency:'USD',day_timezone:'Asia/Bangkok',
   daily_limit_microusd:limit,per_call_reserve_microusd:80000}]};
  if(sql.includes('SELECT id FROM ai_external_spend_reservations'))
   return {rows:duplicate?[{id:'previous'}]:[]};
  if(sql.includes('COALESCE(SUM('))return {rows:[{used}]};
  if(sql.includes('INSERT INTO ai_external_spend_reservations'))return {rows:[{id:'created'}]};
  return {rows:[]};
 },release:()=>{statements.push({sql:'RELEASE'})}};
 return {pool:{connect:async()=>client},statements};
}
test('Bangkok accounting day boundaries ignore server UTC day',()=>{
 assert.equal(bangkokDay(Date.parse('2026-10-28T20:00:00Z')),'2026-10-29');
});
test('PostgreSQL transaction locks and reserves before provider I/O',async()=>{
 const {pool,statements}=fixture();
 const result=await reserveExternalSpend(args,{pool});
 assert.equal(result.costStatus,'unknown');
 assert.equal(statements.filter(x=>x.sql==='COMMIT').length,1);
 assert.ok(statements.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(statements.some(x=>x.sql.includes('lease_expires_at')));
 assert.ok(statements.some(x=>x.sql.includes('INSERT INTO ai_external_spend_reservations')));
 assert.ok(statements.some(x=>x.sql.includes("state='unknown'")));
});
test('no policy, insufficient funds, duplicate call or stale task cannot reserve',async()=>{
 for(const options of [{enabled:false},{used:60000},{duplicate:true},{eligible:false}]){
  const {pool,statements}=fixture(options);
  await assert.rejects(reserveExternalSpend(args,{pool}),e=>e.status===403||e.status===409);
  assert.equal(statements.some(x=>x.sql==='COMMIT'),false);
  assert.ok(statements.some(x=>x.sql==='ROLLBACK'));
 }
});
test('invalid identity and zero estimate fail closed before database',async()=>{
 for(const edit of [{reserveMicrousd:0},{workspaceId:'other/owner'},{executionToken:null},
  {capabilityId:'openseo.saved_rankings'}])
  await assert.rejects(reserveExternalSpend({...args,...edit},{pool:fixture().pool}),e=>e.status===400);
});
