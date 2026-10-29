import {getToken,notifyExpiredSession} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/ops'
export async function opsRequest(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await response.json()
 if(!response.ok){notifyExpiredSession(response);throw Error(data.error+(data.errors?' · '+data.errors.map(e=>'第'+e.row+'行：'+e.message).join('；'):''))}
 return data
}
