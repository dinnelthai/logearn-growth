'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
const {createTraceStore}=require('../src/ai/business/trace');
test('validated final analysis survives storage reopening and is immutable',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 try {
  const store=createTraceStore(db),ctx={ownerId:'alice',runId:'r',traceId:'t',promptVersions:{analysis:'v'}};
  const final={summary:'validated',keyFindings:[],suggestions:[],claims:[]};
  store.begin(ctx,0);store.finish(ctx,0,{responseContent:JSON.stringify(final),contextHash:'hash'});
  store.saveValidatedAnalysis(ctx,0,final);
  store.saveValidatedAnalysis(ctx,0,final);
  assert.deepEqual(createTraceStore(db).list('alice','r')[0].result.validatedAnalysis,final);
  assert.equal(store.list('bob','r').length,0);
  assert.throws(()=>store.saveValidatedAnalysis(ctx,0,{...final,summary:'modified'}),/冲突/);
  assert.throws(()=>store.saveValidatedAnalysis({...ctx,ownerId:'bob'},0,final),/缺少/);
 }finally{db.close()}
});
test('unknown and unvalidated model rounds cannot become finalization checkpoints',()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 try {
  const store=createTraceStore(db),ctx={ownerId:'alice',runId:'r',traceId:'t',promptVersions:{}};
  store.begin(ctx,0);
  assert.throws(()=>store.saveValidatedAnalysis(ctx,0,{summary:'x',suggestions:[]}),/缺少/);
  store.unknown(ctx,0);
  assert.throws(()=>store.saveValidatedAnalysis(ctx,0,{summary:'x',suggestions:[]}),/缺少/);
 }finally{db.close()}
});
