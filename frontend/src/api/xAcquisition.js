import {getToken} from '../auth/authClient.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/x-acquisition'
export async function xRequest(path='',method='GET',body){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw Error(data.error||'X 获客请求失败')
  return data
}
