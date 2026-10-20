// Evidence: "支持 API 请求运营" chat, real SKILL/VIP results on 2026-10-01–09.
// Success rules deliberately do not generalize to other endpoints.
const integer=v=>typeof v==='number'?Number.isSafeInteger(v)?BigInt(v):null:typeof v==='string'&&/^-?\d{1,40}$/.test(v)?BigInt(v):null
const userId=v=>{const n=integer(v);return n!=null&&n>0n?n.toString():null}
function classify(operation,payload,result){
 const unknown=message=>({state:'unknown',message})
 if(!result||typeof result!=='object'||Array.isArray(result))return unknown('返回结构未知，请核实业务结果')
 if(result.code===401&&result.message==='TOKEN_INVALID_OR_EXPIRED')return {state:'failed',halt_batch:true,reason:'token_invalid',message:'Token 已失效；后续未发送项已停止，请更新 Token'}
 if(result.code===500&&result.message==='权限不足')return {state:'failed',halt_batch:true,reason:'permission_denied',message:'Token 无此操作权限；后续未发送项已停止'}
 if(['grant_quota','vip'].includes(operation)&&result.code===500&&result.message==='地址未绑定，请先绑定钱包')return {state:'failed',reason:'identity_unbound',message:'登录身份尚未绑定钱包，未成功发放'}
 if(!['grant_quota','vip'].includes(operation)||result.code!==200||result.message!=='success')return unknown('请求已返回，业务契约未识别，结果待核实')
 const data=result.data
 const mismatch=message=>({state:'unknown',halt_batch:true,reason:'verification_mismatch',message:message+'；后续未发送项已停止，请核实，勿重复发放'})
 if(!data||typeof data!=='object'||Array.isArray(data))return mismatch('成功响应缺少业务数据')
 const id=userId(data.userId)
 if(operation==='grant_quota'){
  if(!id||id!==userId(payload.userId))return mismatch('返回用户 ID 与目标不一致或无法核对')
  const amount=integer(data.quotaAmount),expected=integer(payload.quotaAmount),before=integer(data.balanceBefore),after=integer(data.balanceAfter)
  if(amount==null||expected==null||amount!==expected||before==null||after==null||after-before!==expected)return mismatch('发放量或余额增量与请求不一致')
  if(typeof data.paymentTxHash!=='string'||!data.paymentTxHash.trim())return mismatch('成功响应缺少发放凭据')
  return {state:'success',message:'SKILL 发放成功，用户、发放量及余额增量核对一致',verification:{user_id:true,amount:true,balance_delta:true},summary:{user_id:id,quota_amount:amount.toString(),balance_before:before.toString(),balance_after:after.toString(),reference:data.paymentTxHash}}
 }
 if(!id||data.status!==1||typeof data.expireTime!=='string'||(!Number.isFinite(Date.parse(data.expireTime))||Date.parse(data.expireTime)<=Date.now()))return mismatch('VIP 成功响应缺少有效账号、启用状态或到期时间')
 if(payload.expectedUserId&&id!==userId(payload.expectedUserId))return mismatch('VIP 返回用户 ID 与预期账号不一致')
 return {state:'success',message:payload.expectedUserId?'VIP 发放成功，返回用户 ID 已核对':'VIP 接口返回成功；未提供预期用户 ID，请核对返回账号',verification:{user_id:payload.expectedUserId?true:null,active_status:true,expiry:true},summary:{user_id:id,expire_time:data.expireTime,status:data.status}}
}
module.exports={classify}
