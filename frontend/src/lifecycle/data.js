import {RULES} from './rules.js'
export function normalizeLifecycleFacts(value){
 if(!Array.isArray(value?.rules)||!Array.isArray(value?.deliveries)||value.rules.length!==RULES.length||!RULES.every(r=>value.rules.filter(v=>v.id===r.id&&typeof v.enabled==='boolean'&&['auto','telegram','email'].includes(v.channel)).length===1))throw Error('生命周期接口格式无效');
 const deliveries=value.deliveries.map(d=>({...d,user_id:d.user_id?.startsWith('user:')?d.user_id:'user:'+d.user_id,sent_at:typeof d.sent_at==='number'?d.sent_at:Date.parse(d.sent_at)}));
 if(deliveries.some(d=>typeof d.user_id!=='string'||d.user_id==='user:undefined'||!Number.isFinite(d.sent_at)||!['queued','sent','delivered','unknown','failed','cancelled'].includes(d.status)))throw Error('发送记录格式无效');
 if(value.deliveries_complete!==true)throw Error('发送记录不完整，暂不能执行触达');
 return {...value,deliveries};
}
export function lifecycleRequests(rows){return rows.filter(r=>r.eligible).map(r=>({user_id:r.u.id.replace(/^user:/,''),rule_id:r.rule_id,channel:r.channel,...(r.strategy_run_id?{strategy_run_id:r.strategy_run_id}:{}),...(r.result_id?{result_id:r.result_id}:{})}));}
