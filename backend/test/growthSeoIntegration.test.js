'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{randomUUID}=require('node:crypto');
const fs=require('node:fs');
const {createSeoStore,summarizeSeo}=require('../src/ai/growth/seoStore');
test('real PostgreSQL: Search Console imports stay immutable, owner-scoped and idempotent',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const owner='seo-'+randomUUID(),other='seo-'+randomUUID();
 const store=createSeoStore(db);
 const input={siteUrl:'https://logearn.com/',source:'gsc-manual-export',
  startDate:'2026-10-18',endDate:'2026-10-19',rows:[
   {date:'2026-10-18',query:'meme whale holders',
     page:'https://logearn.com/holders',clicks:2,impressions:150,position:8.3},
   {date:'2026-10-19',query:'memecoin holder analytics',
     page:'https://logearn.com/analysis',clicks:5,impressions:400,position:6.1}
  ]};
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const imported=await Promise.all(Array.from({length:3},
   ()=>store.importSnapshot(owner,input)));
  assert.equal(imported.filter(s=>s.created).length,1);
  assert.equal(new Set(imported.map(s=>s.id)).size,1);
  const list=await store.list(owner);assert.equal(list.length,1);
  assert.equal((await store.list(other)).length,0);
  assert.equal(await store.get(other,imported[0].id),null);
  assert.equal(await store.latestCovering(other,{startDate:'2026-10-18',endDate:'2026-10-19'}),null);
  const snapshot=await store.get(owner,imported[0].id);
  assert.equal(snapshot.start_date,'2026-10-18');
  const result=summarizeSeo(snapshot);
  assert.equal(result.metrics.impressions,550);
  assert.equal(result.opportunities.length,2);
  assert.equal(result.coverage.completeSearchTraffic,false);
  const next=await store.latestCovering(owner,{startDate:'2026-10-18',endDate:'2026-10-19'});
  assert.equal(next.id,imported[0].id);
  const otherImport=await store.importSnapshot(other,input);
  assert.notEqual(otherImport.id,imported[0].id);
  assert.equal((await store.list(other)).length,1);
  assert.equal((await store.get(owner,otherImport.id)),null);
 }finally{
  await db.query('DELETE FROM ai_growth_seo_imports WHERE owner_id IN ($1,$2)',[owner,other]).catch(()=>{});
  await db.end();
 }
});
