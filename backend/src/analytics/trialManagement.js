function normalizeTrial(input){
 const fail=m=>{throw Object.assign(Error(m),{status:400})};const user_id=String(input.user_id||'').trim(),start_at=Number(input.start_at),credits=String(input.credits||'').trim(),vip_days=input.vip_days===''||input.vip_days==null?null:Number(input.vip_days)
 if(!/^[1-9]\d{0,19}$/.test(user_id))fail('请输入有效用户 ID')
 if(!Number.isSafeInteger(start_at)||start_at<=0||start_at>Date.now())fail('请选择不晚于当前时间的观察起点')
 if(credits&&!/^\d{1,19}$/.test(credits))fail('Credits 数量须为非负整数')
 if(vip_days!==null&&(!Number.isSafeInteger(vip_days)||vip_days<1||vip_days>3660))fail('VIP 天数须为 1–3660 的整数')
 const field=k=>String(input[k]||'').trim().slice(0,500)
 return {user_id,start_at,credits,vip_days,source:field('source'),note:field('note'),operator:field('operator')}
}
function trialSummary(rows){const m=new Map();for(const r of rows){let a=m.get(r.user_id)||{positive:false,unknown:false};a.positive||=r.analysis_days>0;a.unknown||=r.analysis_days==null;m.set(r.user_id,a)}return {users:m.size,analysed_users:[...m.values()].filter(x=>x.positive).length,unknown_users:[...m.values()].filter(x=>!x.positive&&x.unknown).length}}
function sevenDaySummary(starts,events,end){const day=86400000,mature=new Set([...starts].filter(([,t])=>t+7*day<=end).map(([id])=>id)),analysed=new Set();for(const e of events){const id=String(e.user_id),t=Number(e.t),start=starts.get(id);if(mature.has(id)&&t>=start&&t<start+7*day)analysed.add(id)}return {mature_users:mature.size,analysed_users:analysed.size}}
module.exports={normalizeTrial,trialSummary,sevenDaySummary}
