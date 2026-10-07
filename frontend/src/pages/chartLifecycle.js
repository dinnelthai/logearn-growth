/** Own resize/theme subscriptions together with their chart. */
export function createChartLifecycle(themeMedia) {
 let chart=null,observer=null,onTheme=null
 function dispose(){
  observer?.disconnect();observer=null
  if(onTheme)themeMedia.removeEventListener('change',onTheme)
  onTheme=null;chart?.dispose();chart=null
 }
 return {
  dispose,
  attach(value,host,paint){
   dispose();chart=value;onTheme=paint
   observer=new ResizeObserver(()=>chart?.resize());observer.observe(host)
   themeMedia.addEventListener('change',onTheme)
  },
 }
}
