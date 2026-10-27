'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createGscService}=require('../src/ai/growth/gscService');
const startDate='2026-10-18',endDate='2026-10-19',siteUrl='sc-domain:logearn.com';
const r=(key,clicks,impressions,position)=>({keys:[key],clicks,impressions,
 ctr:clicks/impressions,position});
test('real PostgreSQL GSC selected property, owner isolation, concurrent deduplication and finalized snapshot reuse',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL,max:5});
 const owner='gsc-test-'+randomUUID(),other='gsc-test-'+randomUUID();
 let reads=0,clock=Date.parse('2026-10-27T12:00:00Z');
 const client={
  status:who=>({configured:who===owner,ownerAuthorized:who===owner,
   mode:'service-account'}),
  sites:async who=>who===owner?[{siteUrl,permissionLevel:'siteOwner'}]:[],
  assertAllowedSite:async(who,site)=>{
   if(who!==owner||site!==siteUrl)throw Object.assign(Error('denied'),{status:403});
   return site;
  },
  searchAnalytics:async(who,req)=>{
   assert.equal(who,owner);assert.equal(req.siteUrl,siteUrl);
   reads++;
   if(req.dimensions[0]==='date')return {rows:[
    r(startDate,9,90,5),r(endDate,10,100,4)]};
   if(req.dimensions[0]==='query')return {rows:[
    r('memecoin holder tracking',2,200,7)]};
   if(req.dimensions[0]==='page')return {rows:[
    r('https://logearn.com/holders',4,45,3)]};
   throw Error('invalid dimension');
  }
 };
 const service=createGscService({db,client,clock:()=>clock});
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const disconnected=await service.connection(other);
  assert.equal(disconnected.configured,false);assert.deepEqual(disconnected.sites,[]);
  const available=await service.connection(owner);
  assert.equal(available.selectedSite,null);assert.equal(available.sites.length,1);
  await assert.rejects(service.select(other,siteUrl),/denied/);
  await service.select(owner,siteUrl);
  assert.equal((await service.connection(owner)).selectedSite,siteUrl);
  assert.equal((await service.connection(other)).selectedSite,null);
  const result=await Promise.all(Array.from({length:3},()=>service.sync(owner,{startDate,endDate})));
  assert.equal(result.filter(x=>!x.cached).length,1);
  assert.equal(result.filter(x=>x.cached).length,2);
  assert.equal(reads,3,'only one complete three-dimension API sync');
  const snapshot=await service.latest(owner,{startDate,endDate});
  assert.equal(snapshot.site_url,siteUrl);
  assert.equal(snapshot.property_totals.clicks,19);
  assert.equal(snapshot.property_totals.impressions,190);
  assert.equal((await service.latest(other)),null);
  assert.equal((await service.sync(owner,{startDate,endDate})).cached,true);
  assert.equal(reads,3);
  clock+=16*60*1000;
  const newSnapshot=await service.sync(owner,{startDate,endDate});
  assert.equal(newSnapshot.cached,false);assert.equal(reads,6);
  assert.notEqual(newSnapshot.report.snapshotId,result[0].report.snapshotId);
  const rows=await db.query('SELECT count(*)::int AS n FROM ai_growth_gsc_snapshots WHERE owner_id=$1',[owner]);
  assert.equal(rows.rows[0].n,2);
 }finally{
  await db.query('DELETE FROM ai_growth_gsc_snapshots WHERE owner_id IN ($1,$2)',[owner,other]).catch(()=>{});
  await db.query('DELETE FROM ai_growth_gsc_settings WHERE owner_id IN ($1,$2)',[owner,other]).catch(()=>{});
  await db.end();
 }
});
