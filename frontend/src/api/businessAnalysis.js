import {getToken,notifyExpiredSession} from '../auth/authClient.js';
const BASE=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001';
async function request(path,body,method=body===undefined?'GET':'POST'){
  const token=getToken(),response=await fetch(BASE+'/api/business-analysis'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json().catch(()=>({}));if(!response.ok){notifyExpiredSession(response);throw Error(result.error||`HTTP ${response.status}`);}return result;
}
export const listBusinessReports=()=>request('/reports');
export const createBusinessReport=body=>request('/reports',body);
export const getBusinessReport=id=>request('/reports/'+encodeURIComponent(id));
export const createBusinessAction=(id,body)=>request('/reports/'+encodeURIComponent(id)+'/actions',body);
export const updateBusinessAction=(id,actionId,body)=>request('/reports/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId),body,'PUT');
export const reviewBusinessAction=(id,actionId)=>request('/reports/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId)+'/review',{});
