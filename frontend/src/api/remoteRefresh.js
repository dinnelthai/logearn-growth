import { fetchBackendMeta } from './backendAnalytics.js'
// Refresh only after an explicit click. No timers or visibility-change requests.
export function mountManualRefresh() {
  const button=document.getElementById('as-refresh-data')
  if(!button)return ()=>{}
  let busy=false,disposed=false
  button.hidden=false
  async function refresh(){
    if(busy||disposed)return
    busy=true;button.disabled=true;button.textContent='刷新中…';button.setAttribute('aria-busy','true')
    try{
      // Bypass the status TTL so even an immediate second refresh queries a new snapshot.
      const meta=await fetchBackendMeta({refresh:true})
      if(!disposed)await globalThis.__refreshRemoteAnalytics?.(meta)
    }catch{
      if(!disposed)document.getElementById('as-data-status').textContent='数据刷新失败 · 保留上次结果，请稍后点击刷新重试'
    }finally{
      busy=false
      if(!disposed){button.disabled=false;button.textContent='刷新数据';button.removeAttribute('aria-busy')}
    }
  }
  button.addEventListener('click',refresh)
  return ()=>{disposed=true;button.removeEventListener('click',refresh)}
}
