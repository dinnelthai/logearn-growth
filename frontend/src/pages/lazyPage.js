import {loadingState} from './loadingState.js'

// Cancel pending imports on navigation just like requests inside an active page.
export function createLazyPage(ctx,load){
 let instance=null,pending=null,generation=0
 async function draw(...args){
  if(instance)return instance.draw(...args)
  ctx.clear()
  const token=++generation,host=ctx.$('#as-output')
  host.innerHTML=loadingState('正在加载分析页面…')
  try{
   pending ||= load().catch(error=>{pending=null;throw error})
   const create=await pending
   if(token!==generation)return
   instance=create(ctx)
   return instance.draw(...args)
  }catch(error){
   if(token!==generation)return
   host.innerHTML=`<section class="a-card si-panel"><p class="si-error">页面加载失败：${ctx.esc(error.message)}</p><button class="a-button" data-page-retry>重试</button></section>`
   host.querySelector('[data-page-retry]').onclick=()=>draw(...args)
  }
 }
 return {draw,dispose(){generation++;instance?.dispose()},hasPendingChanges:()=>instance?.hasPendingChanges?.()||false}
}
