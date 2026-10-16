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

export const fetchKolRanking=body=>request('/ranking','POST',body)
export const listCollaborations=id=>request('/'+encodeURIComponent(id)+'/collaborations')
export const createCollaboration=(id,body)=>request('/'+encodeURIComponent(id)+'/collaborations','POST',body)
export const getCollaboration=(id,c)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c))
export const updateCollaboration=(id,c,body)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c),'PATCH',body)
export const reviewCollaboration=(id,c)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c)+'/review')
export const linkCollaborationActivity=(id,c,body)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c)+'/activities','POST',body)
export const unlinkCollaborationActivity=(id,c,a,body)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c)+'/activities/'+encodeURIComponent(a),'DELETE',body)
export const saveCollaborationCost=(id,c,costId,body)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c)+'/costs'+(costId?'/'+encodeURIComponent(costId):''),costId?'PATCH':'POST',body)

export const getCollaborationReport=(id,c,version)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c)+'/reports/'+version)

export const saveCollaborationRevenue=(id,c,revenueId,body)=>request('/'+encodeURIComponent(id)+'/collaborations/'+encodeURIComponent(c)+'/revenues'+(revenueId?'/'+encodeURIComponent(revenueId):''),revenueId?'PATCH':'POST',body)
