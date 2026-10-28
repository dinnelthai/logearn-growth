import {getToken,notifyExpiredSession} from '../auth/authClient.js'
async function request(path,body){const base=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001',r=await fetch(base+'/api/operations'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await r.json();if(!r.ok){notifyExpiredSession(r);throw Error(data.error||'对比请求失败')};return data}
export const listComparisonReports=params=>request('/reports?'+new URLSearchParams(params))
export const getComparisonReport=id=>request('/reports/'+encodeURIComponent(id))
export const saveComparisonReport=body=>request('/reports',body)
export const rerunComparisonReport=id=>request('/reports/'+encodeURIComponent(id)+'/rerun',{})
export async function compareOperations(body){
 const base=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001'
 const r=await fetch(base+'/api/operations/compare',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(body)}),data=await r.json()
 if(!r.ok){notifyExpiredSession(r);throw Error(data.error||'对比请求失败')}
 return data
}
