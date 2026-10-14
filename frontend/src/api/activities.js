import {getToken} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/activities'
async function request(path='',body){const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw new Error(data.error||'活动请求失败');return data}
export const listActivities=()=>request()
export const validateActivityIds=user_ids=>request('/validate',{user_ids})
export const createActivity=body=>request('',body)
export const activityMetrics=(id,params)=>request('/'+encodeURIComponent(id)+'/metrics?'+new URLSearchParams(params))
export const activityTimeline=(id,user_id,offset=0)=>request('/'+encodeURIComponent(id)+'/timeline?'+new URLSearchParams({user_id,offset}))
export const settleActivity=id=>request('/'+encodeURIComponent(id)+'/settle',{})
