import {getToken,notifyExpiredSession} from '../auth/authClient.js'
export async function fetchUserTags(){
  const res=await fetch((import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/user-tags',{headers:{Authorization:'Bearer '+getToken()}})
  const data=await res.json();if(!res.ok){notifyExpiredSession(res);throw Error(data.error||'标签加载失败')};return data.tags
}
export async function tagAudience(body){
  const res=await fetch((import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/user-tags/audience',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(body)})
  const data=await res.json();if(!res.ok)throw Error(data.error||'标签人群加载失败');return data
}
