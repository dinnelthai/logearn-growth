/**
 * Retain the last rendered page during an explicit, read-only refresh.
 * Prevents a long page from briefly collapsing into a one-line loading placeholder.
 * A different route still receives its normal loading state.
 */
export function beginPageLoad(host,{placeholder,selector,message}){
 const previous=selector&&host?.querySelector?.(selector);
 const doc=host?.ownerDocument;
 if(!previous||!doc?.createElement||!host?.prepend){
  host.innerHTML=placeholder;
  return ()=>{};
 }
 host.querySelector?.(':scope > .ui-refresh-banner')?.remove();
 const notice=doc.createElement('div');
 notice.className='ui-refresh-banner';
 notice.setAttribute('role','status');
 notice.textContent=message||'正在刷新数据，当前结果暂时保留…';
 const priorInert=previous.inert===true;
 previous.inert=true;
 host.prepend(notice);
 return ()=>{
  notice.remove();
  if(previous.isConnected)previous.inert=priorInert;
 };
}
