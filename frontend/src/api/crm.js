import {getToken} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/crm/kols'
async function request(path='',method='GET',body) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data=await response.json()
  if(!response.ok)throw new Error(data.error||'CRM 请求失败')
  return data
}
export const listKols=params=>request('?'+new URLSearchParams(params))
export const getKol=id=>request('/'+encodeURIComponent(id))
export const saveKol=(id,body)=>request(id?'/'+encodeURIComponent(id):'',id?'PATCH':'POST',body)
export const fetchKolMetrics=body=>request('/metrics','POST',body)
export const addFollowup=(id,body)=>request('/'+encodeURIComponent(id)+'/followups','POST',body)
export const linkKolActivity=(id,activity_id)=>request('/'+encodeURIComponent(id)+'/activities','POST',{activity_id})
export const unlinkKolActivity=(id,activity_id)=>request('/'+encodeURIComponent(id)+'/activities/'+encodeURIComponent(activity_id),'DELETE')
