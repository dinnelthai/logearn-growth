const {test}=require('node:test'),assert=require('node:assert/strict'),{classify}=require('../src/ops/response'),{call}=require('../src/ops/client')
const payload={userId:'123',quotaAmount:100},success={code:200,message:'success',data:{userId:123,quotaAmount:100,balanceBefore:200,balanceAfter:300,paymentTxHash:'ADMIN_GRANT_TEST'}}
test('observed SKILL contract verifies account, exact amount and balance delta with integer precision',()=>{
 const r=classify('grant_quota',payload,success);assert.equal(r.state,'success');assert.equal(r.summary.balance_after,'300');assert.deepEqual(r.verification,{user_id:true,amount:true,balance_delta:true})
 const big={...success,data:{...success.data,balanceBefore:'9007199254740993123',balanceAfter:'9007199254740993223'}}
 assert.equal(classify('grant_quota',payload,big).state,'success')
})
test('claimed success with mismatched account, amount, balance or receipt stays unknown and halts the batch',()=>{
 for(const override of [{userId:124},{quotaAmount:99},{balanceAfter:301},{paymentTxHash:''},{balanceBefore:9007199254740992}]){
  const r=classify('grant_quota',payload,{...success,data:{...success.data,...override}});assert.equal(r.state,'unknown');assert.equal(r.halt_batch,true)
 }
 assert.equal(classify('grant_quota',payload,{code:200,message:'success'}).state,'unknown')
})
test('HTTP-200 business token expiration and permission denial are failures that halt remaining rows',()=>{
 for(const result of [{code:401,message:'TOKEN_INVALID_OR_EXPIRED'},{code:500,message:'权限不足'}]){const r=classify('grant_quota',payload,result);assert.equal(r.state,'failed');assert.equal(r.halt_batch,true)}
 const unbound=classify('vip',{}, {code:500,message:'地址未绑定，请先绑定钱包'});assert.equal(unbound.state,'failed');assert(!unbound.halt_batch)
})
test('VIP verifies expected account when provided, active status and a future expiration',()=>{
 const result={code:200,message:'success',data:{userId:7,status:1,expireTime:'2099-10-15T18:25:35.396106245+08:00'}}
 const r=classify('vip',{expectedUserId:'7'},result);assert.equal(r.state,'success');assert.equal(r.verification.user_id,true)
 assert.equal(classify('vip',{},result).verification.user_id,null)
 assert.equal(classify('vip',{expectedUserId:'8'},result).halt_batch,true)
 for(const change of [{status:0},{expireTime:'bad'},{expireTime:'2000-01-01T00:00:00Z'},{userId:null}])assert.equal(classify('vip',{}, {...result,data:{...result.data,...change}}).state,'unknown')
})
test('unobserved endpoint contracts and unknown errors are not promoted to success or definite failure',()=>{
 assert.equal(classify('coupon',{},success).state,'unknown')
 assert.equal(classify('grant_quota',payload,{code:0,success:true}).state,'unknown')
 assert.equal(classify('grant_quota',payload,{code:500,message:'internal error'}).state,'unknown')
})
test('client strips verification-only fields and redacts API keys in real-shaped responses',async()=>{
 let sent
 const vip=await call('vip',{provider:'email',subject:'qa@example.test',effectiveDays:7,expectedUserId:'7'},'test-token',async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({code:200,message:'success',data:{userId:7,status:1,expireTime:'2099-01-01T00:00:00+08:00'}}))})
 assert.equal(vip.state,'success');assert.equal(sent.expectedUserId,undefined);assert.equal(sent.effectiveDays,7)
 const skill=await call('grant_quota',payload,'test-token',async()=>new Response(JSON.stringify({...success,data:{...success.data,apikey:'hidden-api-key',api_key:'hidden-key-2',privateKey:'hidden-private'}})))
 assert.equal(skill.state,'success');assert(!JSON.stringify(skill).includes('hidden-'))
})
