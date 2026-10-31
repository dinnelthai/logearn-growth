'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAgentOutbox}=require('../src/ai/growth/agentOutbox');
test('Executive webhook outbox is opt-in, idempotent, and transmits metadata only',async()=>{
 const seen=new Map(),db={query:async(sql,args)=>{
  assert.match(sql,/ON CONFLICT\(owner_id,channel,source_kind,source_id\) DO NOTHING/);
  assert.equal(args[0].length>0,true);
  assert.equal(args[2],notice.id);
  const payload=JSON.parse(args[4]);
  assert.equal(payload.version,'growth-executive-reminder-v1');
  assert.equal(JSON.stringify(payload).includes('walletAddress'),false);
  assert.equal(JSON.stringify(payload).includes('private note'),false);
  const key=args[0]+':'+args[2];
  if(seen.has(key))return {rows:[]};
  seen.set(key,true);return {rows:[{id:args[0]}]};
 }};
 const notice={id:'a'.repeat(64),kind:'review-due',dueAt:Date.parse('2026-11-01T00:00:00Z'),
  body:{title:'private note',walletAddress:'not allowed'}};
 const out=createAgentOutbox(db);
 assert.equal((await out.enqueueExecutiveNotice({ownerId:'alice',notice})).status,'queued');
 assert.equal((await out.enqueueExecutiveNotice({ownerId:'alice',notice})).status,'existing');
 await assert.rejects(()=>out.enqueueExecutiveNotice({ownerId:'alice',notice:{...notice,id:'forged'}}),/提醒/);
});
