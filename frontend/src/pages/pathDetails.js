import {fetchPathDetails} from '../api/metrics.js'
import {pageVisitsMarkup,bindPageVisits} from './pageVisits.js'
import {openObservedDrill} from './observedDrill.js'
export function mountPathDetails(host,ctx,{cacheId,snapshotId}){
 let disposed=false,sequence=0,loaded=false,loading=false
 host.innerHTML='<details data-path-details-toggle><summary>转化断点、页面访问与请求诊断（按需加载）</summary><p class="a-muted">主路径优先显示；展开后使用同一快照、统计期和人群加载完整诊断。</p><div data-path-details-result></div></details>'
 const details=host.querySelector('[data-path-details-toggle]'),target=host.querySelector('[data-path-details-result]')
 const current=stamp=>!disposed&&stamp===sequence&&host.isConnected
 async function load(){
  if(disposed||loaded||loading)return
  const stamp=++sequence
  if(!snapshotId||!cacheId){target.innerHTML='<p class="si-error">当前结果没有可用快照，请重新运行路径分析。</p>';return}
  loading=true;target.innerHTML='<p role="status">正在读取页面与请求诊断…</p>'
  try{
   const result=await fetchPathDetails(cacheId)
   if(!current(stamp))return
   if(result.drill?.snapshot_id!==snapshotId)throw Error('诊断快照与路径不一致，请重新运行分析')
   if(!result.page_visits||result.details_available===false)throw Error('诊断结果未完整返回，请重试')
   target.innerHTML=pageVisitsMarkup(ctx,result)
   target.querySelectorAll('[data-op-key]').forEach(b=>b.onclick=()=>openObservedDrill(ctx,result,b.dataset.opTitle,b.dataset.opKey))
   bindPageVisits(ctx,result);loaded=true
  }catch(e){if(current(stamp)){target.innerHTML=`<p class="si-error">诊断加载失败：${ctx.esc(e.message)}</p><button class="a-button" data-path-details-retry>重试诊断</button>`;target.querySelector('[data-path-details-retry]').onclick=load}}
  finally{if(current(stamp))loading=false}
 }
 details.ontoggle=()=>{if(details.open)load()}
 return {dispose(){disposed=true;sequence++}}
}
