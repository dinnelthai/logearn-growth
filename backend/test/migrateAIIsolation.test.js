'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/db/migrateAI.js'),'utf8');
function setup(env,actualDatabase='logearn_ai_dev'){
 const sqls=[];
 const pool={end:async()=>{},query:async sql=>{
  sqls.push(sql);
  if(sql.includes('current_database()'))return {rows:[{database_name:actualDatabase}]};
  return {rows:[]};
 }};
 const module={exports:{}};
 const context={module,process:{env,exit:()=>{throw Error('blocked migration')}},__dirname:'/test/src/db',console:{log(){},error(){}},require(id){
  if(id==='dotenv')return {config:()=>{}};
  if(id==='fs')return {readFileSync:()=> 'CREATE TABLE test_only (id int);'};
  if(id==='path')return path;
  if(id==='./aiPool')return pool;
  throw Error('unexpected '+id)
 }};
 vm.runInNewContext(source,context,{filename:'migrateAI.js'});
 return {migrate:module.exports.migrateAITables,sqls};
}
test('migration refuses missing explicit approval before any SQL',async()=>{
 const x=setup({AI_DATABASE_URL:'postgres://test@127.0.0.1:55432/logearn_ai_dev'});
 await assert.rejects(x.migrate(),/blocked migration/);
 assert.equal(x.sqls.length,0);
});
test('migration checks database identity before DDL',async()=>{
 const x=setup({AI_DATABASE_URL:'postgres://test@127.0.0.1:55432/logearn_ai_dev',AI_DATABASE_EXPECTED_NAME:'wrong_db',AI_MIGRATION_APPROVED:'1'});
 await assert.rejects(x.migrate(),/blocked migration/);
 assert.equal(x.sqls.length,1);
 assert.match(x.sqls[0],/current_database\(\)/);
});
test('approved matching database permits schema SQL',async()=>{
 const x=setup({AI_DATABASE_URL:'postgres://test@127.0.0.1:55432/logearn_ai_dev',AI_DATABASE_EXPECTED_NAME:'logearn_ai_dev',AI_MIGRATION_APPROVED:'1'});
 await x.migrate();
 assert.ok(x.sqls.some(x=>x.includes('CREATE TABLE')));
 assert.equal(x.sqls.filter(x=>x.includes('current_database()')).length,1);
});
