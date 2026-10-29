import {loadingState} from './loadingState.js'
import {viewState} from '../components/viewStates.js'

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
   host.innerHTML=viewState({kind:'error',title:'页面加载失败',
    description:error?.message||String(error),actionLabel:'重试',actionAttr:'data-page-retry'})
   host.querySelector('[data-page-retry]')?.addEventListener?.('click',()=>draw(...args))
   // Older test doubles and embedded hosts expose onclick without addEventListener.
   const retry=host.querySelector('[data-page-retry]')
   if(retry&&!retry.addEventListener)retry.onclick=()=>draw(...args)
  }
 }
 return {draw,dispose(){generation++;instance?.dispose()},hasPendingChanges:()=>instance?.hasPendingChanges?.()||false}
}
