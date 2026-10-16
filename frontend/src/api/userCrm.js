import {getToken} from '../auth/authClient.js'
const base=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001'
async function request(path='',method='GET',body){const r=await fetch(base+'/api/user-crm'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok)throw Error(v.error||'运营资料请求失败');return v}
export const crmData=(user,params={})=>request('?'+new URLSearchParams({...params,...(user?{user_key:user}:{})}))
export const crmWrite=(path,body,method='POST')=>request(path,method,body)
export const crmHistory=(id,offset=0)=>request('/history/'+encodeURIComponent(id)+'?offset='+offset)

export const crmReports=user=>request('/reports'+(user?'?'+new URLSearchParams({user_key:user}):''))
export const crmReport=id=>request('/reports/'+encodeURIComponent(id))
