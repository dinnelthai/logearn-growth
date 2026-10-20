import {getToken} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/activities'
async function request(path='',body,method){const res=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw new Error(data.error||'活动请求失败');return data}
export const listActivities=(archive='active')=>request('?archive='+archive)
export const validateActivityIds=user_ids=>request('/validate',{user_ids})
export const validateBatchIds=(id,user_ids)=>request('/'+encodeURIComponent(id)+'/validate-batch',{user_ids})
export const importKolRoster=(kol_id,scope)=>request('/import-kol',{kol_id,scope})
export const createActivity=body=>request('',body)
export const getActivitySchedule=id=>request('/'+encodeURIComponent(id)+'/schedule')
export const updateActivitySchedule=(id,body)=>request('/'+encodeURIComponent(id)+'/schedule',body,'PATCH')
export const retryActivityStart=(id,expected_schedule_version)=>request('/'+encodeURIComponent(id)+'/start',{expected_schedule_version})
export const activityMetrics=(id,params)=>request('/'+encodeURIComponent(id)+'/metrics?'+new URLSearchParams(params))
export const activityTimeline=(id,user_id,offset=0)=>request('/'+encodeURIComponent(id)+'/timeline?'+new URLSearchParams({user_id,offset}))
export const settleActivity=id=>request('/'+encodeURIComponent(id)+'/settle',{})

export const activityRoster=id=>request('/'+encodeURIComponent(id)+'/roster')
export const activityBatches=id=>request('/'+encodeURIComponent(id)+'/batches')
export const appendActivityBatch=(id,body)=>request('/'+encodeURIComponent(id)+'/batches',body)
export const updateActivityTag=(id,body)=>request('/'+encodeURIComponent(id)+'/tag-members',body)
export const archiveActivity=(id,archived)=>request('/'+encodeURIComponent(id),{archived},'PATCH')

export const updateActivityStartTime=(id,body)=>request('/'+encodeURIComponent(id)+'/start-time',body,'PATCH')

export const resolveActivityAddresses=addresses=>request('/resolve-addresses',{addresses})
