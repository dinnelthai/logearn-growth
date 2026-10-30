/**
 * Keep a rendered page visible while a read-only refresh runs.
 * Re-entrant refreshes retire the previous banner without leaving stale content inert.
 * Navigation to another page still gets the normal loading state.
 */
const activeLoads=new WeakMap();

export function beginPageLoad(host,{placeholder,selector,message}={}){
 const old=activeLoads.get(host);
 old?.finish();
 const previous=selector&&host?.querySelector?.(selector);
 const doc=host?.ownerDocument;
 if(!previous||!doc?.createElement||!host?.prepend){
  host.innerHTML=placeholder;
  return ()=>{};
 }
 const notice=doc.createElement('div');
 notice.className='ui-refresh-banner';
 notice.setAttribute('role','status');
 notice.textContent=message||'正在刷新数据，当前结果暂时保留…';
 const priorInert=previous.inert===true;
 previous.inert=true;
 host.prepend(notice);
 const state={finish:()=>{
  if(activeLoads.get(host)!==state)return;
  activeLoads.delete(host);
  notice.remove();
  if(previous.isConnected)previous.inert=priorInert;
 }};
 activeLoads.set(host,state);
 return state.finish;
}
