'use strict';
// Human approval remains mandatory. No external action is performed here.
const allowed=Object.freeze({
 pending:['adopted','rejected','invalid'],
 adopted:['executing','rejected','invalid'],
 executing:['executed','rejected','invalid'],
 executed:[],rejected:[],invalid:[]
});
function validateActionTransition(current,target,{actualAction,rejectionReason}={}){
 if(typeof current!=='string'||!Object.hasOwn(allowed,current))throw Object.assign(Error('未知的当前建议状态'),{status:409});
 if(typeof target!=='string'||!Object.hasOwn(allowed,target))throw Object.assign(Error('未知的目标建议状态'),{status:400});
 if(!allowed[current].includes(target))throw Object.assign(Error('建议状态转换不允许：'+current+' → '+target),{status:409});
 if(target==='rejected'&&(!rejectionReason||!rejectionReason.trim()))throw Object.assign(Error('拒绝时必须记录原因'),{status:400});
 if(target==='executed'&&(!actualAction||!actualAction.trim()))throw Object.assign(Error('执行完成需要实际行动记录'),{status:400});
 return {from:current,to:target,humanApprovalRequired:true,externalAction:false};
}
module.exports={allowed,validateActionTransition};
