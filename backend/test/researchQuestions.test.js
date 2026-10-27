'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createResearchQuestions,questionFor}=require('../src/ai/growth/researchQuestions');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE agent_research_questions(owner_id TEXT NOT NULL,id TEXT NOT NULL,
 change_id TEXT NOT NULL,source TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,
 question TEXT NOT NULL,priority INTEGER NOT NULL,status TEXT NOT NULL,occurred_at INTEGER,
 created_at INTEGER,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,change_id,source));`);
 return {db,store:createResearchQuestions(db)};
}
const change={id:'c-1',kind:'product',occurredAt:1000,validUntil:null};
test('business changes enqueue only reviewable zero-cost questions and dedupe',()=>{
 const {db,store}=fixture();
 try{
  assert.equal(store.plan('one',[change],{now:2000}).inserted.length,1);
  assert.equal(store.plan('one',[change],{now:2000}).inserted.length,0);
  assert.equal(store.plan('two',[change],{now:2000}).inserted.length,1);
  assert.equal(store.list('one').length,1);
  assert.equal(store.list('two').length,1);
  const item=store.list('one')[0];
  assert.match(item.question,/成熟分母/);
  assert.equal(store.decide('one',item.id,'approve').changed,true);
  assert.equal(store.list('one').length,0);
  assert.equal(store.list('one',{status:'approved'}).length,1);
  assert.equal(store.list('two').length,1);
 }finally{db.close()}
});
test('future events or expired events cannot create research',()=>{
 assert.equal(questionFor({...change,occurredAt:3000},{now:2000}),null);
 assert.equal(questionFor({...change,validUntil:1500},{now:2000}),null);
});
