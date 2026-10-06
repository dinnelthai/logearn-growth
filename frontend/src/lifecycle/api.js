const BASE=import.meta.env.VITE_ANALYTICS_API_BASE_URL??'/api/analytics'
async function request(path,method='GET',body){const r=await fetch(BASE+'/lifecycle'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('生命周期接口请求失败（'+r.status+'）');return r.json()}
export const fetchLifecycle=(source='all')=>request('?source='+encodeURIComponent(source))
export const saveLifecycleRules=rules=>request('/rules','PUT',{rules})
export const dispatchLifecycle=({requests,as_of,idempotency_key})=>request('/dispatch','POST',{requests,as_of,idempotency_key})
