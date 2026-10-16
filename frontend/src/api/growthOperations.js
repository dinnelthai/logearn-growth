import {getToken} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api'
export async function growthRequest(path,body){const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw Error(data.error||'运营请求失败');return data}
export const tagHistory=params=>growthRequest('/user-tags/history?'+new URLSearchParams(params))
