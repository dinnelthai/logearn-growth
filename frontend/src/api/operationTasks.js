import {getToken,notifyExpiredSession} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/operation-tasks'
async function request(path='',body,method=body===undefined?'GET':'POST'){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})}),d=await r.json()
 if(!r.ok){notifyExpiredSession(r);throw Object.assign(Error(d.error||'任务请求失败'),{status:r.status})};return d
}
export const createOperationTask=body=>request('',body)
export const getOperationTask=id=>request('/'+encodeURIComponent(id))
export const updateOperationTask=(id,body)=>request('/'+encodeURIComponent(id),body,'PATCH')
export const operationTaskAudience=id=>request('/'+encodeURIComponent(id)+'/audience')
export const reviewOperationTask=id=>request('/'+encodeURIComponent(id)+'/review')
