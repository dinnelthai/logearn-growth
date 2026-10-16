import {getToken} from '../auth/authClient.js'
const base=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001'
async function request(path,{method='GET',body}={}){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'运营请求失败'),{status:r.status});return value}
export const fetchUserProfile=(id,context)=>request('/users/'+encodeURIComponent(id)+'/profile?'+new URLSearchParams(Object.entries(context).filter(([,v])=>v!=null)))
export const saveUserFollowup=(id,body)=>request('/users/'+encodeURIComponent(id)+'/followups',{method:'POST',body})
export const setFollowupStatus=(id,status)=>request('/user-followups/'+encodeURIComponent(id),{method:'PATCH',body:{status}})
export const fetchWorkbench=()=>request('/workbench')
export const changeKolMember=(id,body)=>request('/crm/kols/'+encodeURIComponent(id)+'/members',{method:'PATCH',body})
