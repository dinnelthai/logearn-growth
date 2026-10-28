'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compactChanges,compactMemory}=require('../src/ai/business/contextBudget');
test('large business changes never flood new model context or mutate source',()=>{
 const rows=Array.from({length:100},(_,i)=>({
  id:'c'+i,kind:'activity',source:'all',occurredAt:i,validUntil:null,
  content:'活动资料'.repeat(2000)
 }));
 const original=JSON.stringify(rows);
 const {items,meta}=compactChanges(rows);
 assert.equal(items.length,16);assert.equal(meta.omitted,84);
 assert.equal(items[0].id,'c0');
 assert.ok(items.every(x=>Buffer.byteLength(x.content,'utf8')<=650));
 assert.ok(Buffer.byteLength(JSON.stringify({items,meta}))<25000);
 assert.equal(JSON.stringify(rows),original);
});
test('recent memory is bounded while preserving some older negative evidence',()=>{
 const rows=Array.from({length:30},(_,i)=>({id:'m'+i,
  business_problem:'p'.repeat(2000),result_summary:'r'.repeat(2000),
  effectiveness:i===25?'ineffective':'effective'}));
 const original=JSON.stringify(rows);
 const view=compactMemory(rows);
 assert.ok(view.items.length<=16);
 assert.equal(view.meta.omitted,30-view.items.length);
 assert.ok(view.items.some(x=>x.id==='m25'&&x.effectiveness==='ineffective'));
 assert.ok(view.items.every(x=>Buffer.byteLength(x.business_problem,'utf8')<=360));
 assert.equal(JSON.stringify(rows),original);
});
