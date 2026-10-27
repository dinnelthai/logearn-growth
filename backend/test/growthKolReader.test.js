'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createKolReader}=require('../src/ai/growth/kolReader');
const start=Date.parse('2026-10-18T00:00:00Z'),end=Date.parse('2026-10-20T00:00:00Z');
const old=process.env.ANALYTICS_STORAGE;
const db={prepare(sql){return {all(arg){
 if(sql.includes('crm_kols'))return [
  {id:'kol-a',name:'Alpha',stage:'合作中',account_id:'acc-a',updated_at:100},
  {id:'kol-b',name:'Beta',stage:'沟通中',account_id:'acc-b',updated_at:90}
 ];
 if(sql.includes('crm_kol_members'))return arg==='kol-a'?[{user_id:'private-user'}]:[];
 throw Error('unexpected read: '+sql);
 }} }};
const remote={status:async()=>({snapshot_id:'w1',as_of:'2026-10-22T00:00:00Z'})};
const ranking=async(profiles,period,scope,snapshot)=>{
 assert.equal(scope,'tagged');assert.deepEqual(period,{start,end});
 assert.equal(snapshot.snapshot_id,'w1');
 assert.equal(profiles.length,2);
 assert.equal(profiles[0].user_ids[0],'private-user');
 return {errors:{trade:'missing trade coverage'},
 metrics:[{id:'kol-a',total:{users:10,analysis_users:4,analysis_events:13,
    trade_users:2,transactions:3,volume_usd:10000,missing_values:0}},
  {id:'kol-b',total:null,reason:'账号尚无观测'}]};
};
test('KOL reader reuses existing owner CRM and ranking, removes member identity and marks missing trade data unknown',async()=>{
 process.env.ANALYTICS_STORAGE='hologres';
 try{
  const result=await createKolReader({db,remote,ranking,attachAccounts:(_db,rows)=>rows})
   .summarize({ownerId:'alice',start,end,source:'all'});
  assert.equal(result.available,true);
  assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].observedUsers,10);
  assert.equal(result.rows[0].analysisEvents,13);
  assert.equal(result.rows[0].transactions,null);
  assert.equal(result.rows[0].volumeUsd,null);
  assert.equal(result.rows[1].observedUsers,null);
  assert.equal(result.coverage.status,'partial');
  assert.ok(result.warnings.some(x=>x.includes('不构成')));
  assert.ok(!JSON.stringify(result).includes('private-user'));
  assert.ok(!JSON.stringify(result).includes('acc-a'));
 }finally{if(old===undefined)delete process.env.ANALYTICS_STORAGE;else process.env.ANALYTICS_STORAGE=old;}
});
test('unconfigured analytics, insufficient watermark and narrower source fail closed',async()=>{
 const reader=createKolReader({db,remote,ranking,attachAccounts:(_db,rows)=>rows});
 try{
  process.env.ANALYTICS_STORAGE='sqlite';
  assert.equal((await reader.summarize({ownerId:'alice',start,end})).available,false);
  process.env.ANALYTICS_STORAGE='hologres';
  assert.equal((await createKolReader({db,
   remote:{status:async()=>({snapshot_id:'old',as_of:'2026-10-19T00:00:00Z'})},
   ranking,attachAccounts:(_db,rows)=>rows}).summarize({ownerId:'alice',start,end})).available,false);
  await assert.rejects(reader.summarize({ownerId:'alice',start,end,source:'twitter'}),/全来源/);
 }finally{if(old===undefined)delete process.env.ANALYTICS_STORAGE;else process.env.ANALYTICS_STORAGE=old;}
});
