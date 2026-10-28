'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg');
const {statusQueries,decodeFacet}=require('../src/data/hologres');
test('PostgreSQL equivalence: four legacy status scans and one compact statement',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const pool=new Pool({connectionString:process.env.AI_DATABASE_URL,max:1});
 const client=await pool.connect();
 const cutoff='2026-10-28T00:00:00.000Z';
 try{
  const db=(await client.query('SELECT current_database() AS db')).rows[0].db;
  assert.equal(db,'ai_test','never run on an uncontrolled database');
  await client.query('BEGIN');
  await client.query(`CREATE TEMP TABLE growth_events(
   id bigint,event_id text,server_ts timestamptz,client_ts bigint,
   user_id text,anonymous_id text,event_name text,
   first_entry_source text,properties jsonb)`);
  const rows=[
   [1,'e1','2026-10-25T00:00:00Z',Date.parse('2026-10-25T00:00:00Z'),'user123','anon1','chip_analysis_viewed','seo','{"module":"chip"}'],
   [2,'e1','2026-10-26T00:00:00Z',Date.parse('2026-10-26T00:00:00Z'),'user123','anon1','chip_analysis_viewed','seo','{"module":"chip"}'],
   [3,'e2','2026-10-26T00:00:00Z',Date.parse('2026-10-26T00:00:00Z'),'user456','anon2','strategy_started','twitter','{"strategy_type":"momentum","module":"strategy"}'],
   [4,'e3','2026-10-27T00:00:00Z',Date.parse('2026-10-27T00:00:00Z'),'user456','anon2','chip_analysis_drilldown',null,'{"module":"chip"}']
  ];
  for(const row of rows)await client.query(`INSERT INTO growth_events
   (id,event_id,server_ts,client_ts,user_id,anonymous_id,event_name,first_entry_source,properties)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,row);
  const q=statusQueries(),args=[cutoff];
  const [count,source,strategy,types,combined]=await Promise.all([
   client.query(q.count,args),client.query(q.sources,args),
   client.query(q.strategies,args),client.query(q.eventTypes,args),
   client.query(q.combined,args)
  ]);
  const original=count.rows[0],next=combined.rows[0];
  for(const k of ['n','start','latest']){
   assert.equal(String(original[k]),String(next[k]),k);
  }
  assert.deepEqual(decodeFacet(next.source_values),source.rows.map(x=>x.value));
  assert.deepEqual(decodeFacet(next.strategy_values),strategy.rows.map(x=>x.value));
  const sorted=a=>a.map(x=>JSON.stringify(x)).sort();
  assert.deepEqual(sorted(decodeFacet(next.event_type_values)),sorted(types.rows));
  assert.equal(Number(next.n),3,'event_id is deduplicated as before');
 }finally{
  await client.query('ROLLBACK').catch(()=>{});
  client.release();await pool.end();
 }
});
