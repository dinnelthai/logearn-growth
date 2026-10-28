// Keep navigation URLs limited to known view modes; never serialize private filters or user data.
export const INTERNAL_VIEWS = Object.freeze(['referral','login-conversion','invite-conversion','my-monitor']);

export function createViewHistory({location,history,eventTarget,validModes,onNavigate}){
  const allowed=new Set(validModes);
  const fallback=allowed.has('home')?'home':[...allowed][0];
  const safe=view=>allowed.has(view)?view:fallback;

  const read=()=>{
    try{return safe(new URL(location.href).searchParams.get('view'))}
    catch{return fallback}
  };

  const write=(view,replace=false)=>{
    if(!location?.href||!history)return;
    try{
      const url=new URL(location.href);
      const target=safe(view);
      if(url.searchParams.get('view')===target)return;
      url.searchParams.set('view',target);
      const previous=history.state;
      const state=previous&&typeof previous==='object'&&!Array.isArray(previous)?{...previous}:{};
      history[replace?'replaceState':'pushState'](state,'',url.pathname+url.search+url.hash);
    }catch{/* History API can be unavailable in embedded or sandboxed contexts. */}
  };

  const onPop=()=>onNavigate(read());
  eventTarget?.addEventListener?.('popstate',onPop);
  return {
    read,
    push:view=>write(view),
    replace:view=>write(view,true),
    dispose:()=>eventTarget?.removeEventListener?.('popstate',onPop)
  };
}
