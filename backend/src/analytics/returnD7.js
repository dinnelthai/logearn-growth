// An observed D7 reactivation means seven COMPLETE Asia/Bangkok calendar
// days with no recorded foreground use, then a core product event.
const DAY=86400000, OFFSET=25200000;
const ACTIVE_EVENTS=Object.freeze(['page_viewed','login_succeeded','token_detail_viewed','token_opened','chip_analysis_viewed','chip_analysis_drilldown','strategy_started','trade_succeeded']);
const CORE_EVENTS=Object.freeze(['chip_analysis_viewed','chip_analysis_drilldown','strategy_started','trade_succeeded']);
const businessDay=t=>Math.floor((Number(t)+OFFSET)/DAY);
function returnD7FromDays(activityDays,coreTimes,{start,end}){
 const days=[...new Set((activityDays||[]).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
 const firstCore=new Map();
 for(const raw of coreTimes||[]){
  const t=Number(raw);if(!Number.isFinite(t))continue;
  const day=businessDay(t),old=firstCore.get(day);
  if(old===undefined||t<old)firstCore.set(day,t);
 }
 const returns=[];
 for(let i=1;i<days.length;i++){
  const t=firstCore.get(days[i]);
  if(days[i]-days[i-1]>=8&&t!==undefined&&t>=start&&t<end)
   returns.push({at:t,blank_days:days[i]-days[i-1]-1});
 }
 return {returned:returns.length>0,first_return_at:returns[0]?.at??null,returns};
}
module.exports={DAY,OFFSET,ACTIVE_EVENTS,CORE_EVENTS,businessDay,returnD7FromDays};
