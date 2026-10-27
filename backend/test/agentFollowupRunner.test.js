const test=require('node:test'),assert=require('node:assert/strict');
const {runTask}=require('../src/ai/business/runner');
const makeStore=()=>{
 const events=[],saved=[];
 return {events,saved,
  savePrompt(){},begin(_ctx,round){events.push('begin:'+round)},
  finish(_ctx,round,result){events.push('finish:'+round);saved.push(result)},
  saveFollowup(_ctx,round,content,kind){events.push('followup:'+round);saved[round].followup={kind,content}},
  unknown(){events.push('unknown')}
 };
};
const request={context:{},prompt:'test',ownerId:'alice',operationId:'repair-run',operationType:'analysis'};
const valid={summary:'ok',keyFindings:[],suggestions:[]};

test('parsing failure saves exact correction before next model call',async()=>{
 const store=makeStore(),messages=[];
 const replies=['unparseable',JSON.stringify(valid)];
 const result=await runTask({...request,traceStore:store,clientFactory:()=>({
  modelInfo:{provider:'mock'},
  chat:async m=>{messages.push(m.map(x=>({...x})));return {content:replies.shift(),usage:{totalTokens:10},cost:0,provider:'mock'}}
 })});
 assert.equal(result.analysis.summary,'ok');
 assert.equal(store.saved[0].followup.kind,'parse-error');
 assert.equal(messages[1].at(-1).content,store.saved[0].followup.content);
 assert.ok(store.events.indexOf('followup:0')<store.events.indexOf('begin:1'));
});
test('validation failure records precise feedback before next model call',async()=>{
 const store=makeStore(),messages=[],replies=[JSON.stringify({summary:'incomplete'}),JSON.stringify(valid)];
 let attempts=0;
 const result=await runTask({...request,traceStore:store,
  validate:()=>{if(++attempts===1)throw Error('need claims')},
  clientFactory:()=>({modelInfo:{provider:'mock'},chat:async m=>{messages.push(m.map(x=>({...x})));return {content:replies.shift(),usage:{totalTokens:10},cost:0,provider:'mock'}}})
 });
 assert.equal(result.analysis.summary,'ok');
 assert.equal(store.saved[0].followup.kind,'validation-error');
 assert.match(store.saved[0].followup.content,/need claims/);
 assert.equal(messages[1].at(-1).content,store.saved[0].followup.content);
});
