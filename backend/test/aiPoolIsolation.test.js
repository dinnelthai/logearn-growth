'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/db/aiPool.js'),'utf8');
function load(env){
 const state={constructed:0,fallBack:0,options:null};
 class Pool{constructor(options){state.constructed++;state.options=options}on(){return this}}
 const module={exports:{}};
 vm.runInNewContext(source,{module,process:{env},console,URL,require(id){
  if(id==='pg')return {Pool};
  if(id==='./readWritePool'){state.fallBack++;throw Error('must never use business pool')}
  throw Error('unexpected require: '+id)
 }},{filename:'aiPool.js'});
 return {pool:module.exports,state};
}
test('missing AI_DATABASE_URL fails closed without loading business writer',async()=>{
 const {pool,state}=load({PGHOST:'business.example',PGDATABASE:'business'});
 assert.equal(state.constructed,0);assert.equal(state.fallBack,0);
 await assert.rejects(pool.query('INSERT INTO ai_suggestions VALUES (...)'),e=>e.status===503&&e.code==='AI_DATABASE_NOT_READY');
 await assert.rejects(pool.connect(),/AI_DATABASE_URL/);
 assert.equal(await pool.end(),undefined);
 assert.equal(pool.on('error',()=>{}),pool);
});
test('same business database is rejected even if explicitly configured',async()=>{
 const {pool,state}=load({AI_DATABASE_URL:'postgresql://ai:secret@business.example:5432/business',PGHOST:'business.example',PGDATABASE:'business',PGPORT:'5432'});
 assert.equal(state.constructed,0);
 await assert.rejects(pool.query('CREATE TABLE ai_test (id int)'),/相同/);
});
test('unrecognized scheme cannot initialize a PostgreSQL writer',async()=>{
 const {pool,state}=load({AI_DATABASE_URL:'https://business.example/api/pg'});
 assert.equal(state.constructed,0);
 await assert.rejects(pool.connect(),/独立 PostgreSQL/);
});
test('explicit independent AI_DATABASE_URL can initialize pg Pool',()=>{
 const url='postgresql://ai:secret@127.0.0.1:55432/logearn_ai_dev';
 const {pool,state}=load({AI_DATABASE_URL:url,PGHOST:'business.example',PGDATABASE:'business'});
 assert.equal(state.constructed,1);
 assert.equal(state.options.connectionString,url);
 assert.equal(typeof pool.on,'function');
});
