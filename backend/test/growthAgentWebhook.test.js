'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {webhookConfig,sendAgentWebhook}=require('../src/ai/growth/agentWebhook');
test('agent proactive delivery is disabled without explicit flag and rejects unsafe destinations',()=>{
 assert.deepEqual(webhookConfig({}),{});
 assert.throws(()=>webhookConfig({AI_AUTONOMY_EXTERNAL_NOTICES_ENABLED:'1',
  AI_AUTONOMY_WEBHOOKS_JSON:JSON.stringify({
   alice:{url:'http://localhost/hook',secret:'x'.repeat(40)}})}),/HTTPS/);
 assert.throws(()=>webhookConfig({AI_AUTONOMY_EXTERNAL_NOTICES_ENABLED:'1',
  AI_AUTONOMY_WEBHOOKS_JSON:JSON.stringify({
   alice:{url:'https://127.0.0.1/hook',secret:'x'.repeat(40)}})}),/HTTPS/);
});
test('only explicitly authorized owner gets HMAC signed payload and deterministic idempotency key',async()=>{
 const secret='test-'.repeat(10),requests=[];
 const config=webhookConfig({AI_AUTONOMY_EXTERNAL_NOTICES_ENABLED:'1',
  AI_AUTONOMY_WEBHOOKS_JSON:JSON.stringify({
   alice:{url:'https://notify.example.com/daily',secret}})});
 const item={id:'notify-1',owner_id:'alice',
  payload:{briefId:'brief-1',status:'ready',score:70}};
 const result=await sendAgentWebhook(item,{config,now:123,
  request:async(url,options)=>{requests.push({url,options});return {ok:true,status:202}}});
 assert.equal(result,202);
 assert.equal(requests.length,1);
 assert.equal(requests[0].options.redirect,'error');
 assert.equal(requests[0].options.headers['X-LogEarn-Idempotency-Key'],'notify-1');
 assert.equal(requests[0].options.headers['X-LogEarn-Signature'],
  'sha256='+createHmac('sha256',secret).update(JSON.stringify(item.payload)).digest('hex'));
 await assert.rejects(sendAgentWebhook({...item,owner_id:'bob'},{
  config,request:()=>{throw Error('should never dispatch')}}),/未授权/);
});
