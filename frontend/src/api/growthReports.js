import {getToken,notifyExpiredSession} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/growth-reports'
export async function growthReportRequest(path='',body){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const result=await response.json();if(!response.ok){notifyExpiredSession(response);throw Error(result.error||'报告请求失败')};return result
}
