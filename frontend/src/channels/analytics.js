const DAY=86400000,day=t=>Math.floor((t+7*3600000)/DAY),timestamp=v=>Date.parse(v);
export function computeChannels({rules,users,trades,startAt,endAt,asOf,channel='all'}){
 // Build rows from users who have a channelFact derived from first_visit_captured events
 const records=users.filter(u=>u.channelFact&&timestamp(u.channelFact.first_visit_at)>=startAt&&timestamp(u.channelFact.first_visit_at)<endAt&&(channel==='all'||u.channelFact.channel_id===channel));
 const rows=records.map(u=>{
  const r=u.channelFact,visitTs=timestamp(r.first_visit_at);
  const es=(u.events??[]).filter(e=>e.t>=visitTs&&e.t<endAt&&e.t<=asOf).sort((a,b)=>a.t-b.t);
  const login=es.find(e=>e.type==='login'),token=login&&es.find(e=>e.type==='token'&&e.t>login.t),chip=token&&es.find(e=>e.type==='chip'&&e.t>token.t),analysis=es.some(e=>e.type==='chip');
  const first=(u.events??[]).find(e=>e.type==='chip'),mature=first&&day(first.t)>=day(startAt)&&day(first.t)<day(endAt)&&(day(first.t)+8)*DAY-7*3600000<=asOf;
  const retained=mature&&u.events.some(e=>e.type==='chip'&&day(e.t)===day(first.t)+7);
  const tx=Array.isArray(trades)?trades.filter(t=>t.user_id===u.id&&t.status==='confirmed'&&t.confirmed_at>=startAt&&t.confirmed_at<endAt):null;
  return {user_id:u.id,channel_id:r.channel_id,first_visit_at:r.first_visit_at,source_fields:r.source_fields,payments:r.payments,referrer:r.referrer,login:!!login,token:!!token,chip:!!chip,analysis,strategy:es.some(e=>e.type==='ai'),mature:!!mature,retained:!!retained,trade:tx?tx.length>0:null,volume:tx?tx.reduce((n,t)=>n+t.volume_usd,0):null,paid:Array.isArray(r.payments)?r.payments.some(p=>p.status==='paid'&&timestamp(p.paid_at)>=startAt&&timestamp(p.paid_at)<endAt):null};
 });
 const aggregate=rs=>({visits:rs.length,login:rs.filter(r=>r.login).length,token:rs.filter(r=>r.token).length,chip:rs.filter(r=>r.chip).length,analysis:rs.filter(r=>r.analysis).length,strategy:rs.filter(r=>r.strategy).length,eligible:rs.filter(r=>r.mature).length,retained:rs.filter(r=>r.retained).length,traders:Array.isArray(trades)?rs.filter(r=>r.trade).length:null,volume:Array.isArray(trades)?rs.reduce((n,r)=>n+r.volume,0):null,paid:rs.every(r=>r.paid!==null)?rs.filter(r=>r.paid).length:null});
 const groups=rules.filter(r=>channel==='all'||r.id===channel).map(rule=>({id:rule.id,name:rule.name,...aggregate(rows.filter(r=>r.channel_id===rule.id))}));
 const days=Array.from({length:Math.ceil((endAt-startAt)/DAY)},(_,i)=>{const t=startAt+i*DAY;return {t,...aggregate(rows.filter(r=>day(timestamp(r.first_visit_at))===day(t)))}});

 // Referrer domain breakdown from channelFact.referrer (set from first_visit_captured event)
 function referrerDomain(url){if(!url)return '(direct)';try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}}
 const refMap=new Map();
 for(const r of rows){
  const domain=referrerDomain(r.referrer??'');
  if(!refMap.has(domain))refMap.set(domain,{domain,count:0,analysis:0});
  const entry=refMap.get(domain);entry.count++;if(r.analysis)entry.analysis++;
 }
 const referrerBreakdown=[...refMap.values()].sort((a,b)=>b.count-a.count);

 return {groups,days,total:aggregate(rows),referrerBreakdown,hasData:rows.length>0};
}
