const H=3600000,D=24*H
export function lifecycleDemoUsers(asOf) {
 const sequences=[ [{type:'login',t:asOf-H}], [{type:'login',t:asOf-2*D},{type:'chip',t:asOf-2*D}], [{type:'login',t:asOf-2*H},{type:'ai',t:asOf-2*H,strategy_run_id:'run-demo',strategy:'1.5段'},{type:'strategy_result',t:asOf-H,strategy_run_id:'run-demo',result_id:'result-demo'}], [{type:'chip',t:asOf-4*D}], Array.from({length:7},(_,i)=>({type:'chip',t:asOf-i*D-H})), [{type:'chip',t:asOf-40*D}]]
 sequences[4].push({type:'ai',t:asOf-7*D,strategy:'1.5段'})
 return sequences.map((events,i)=>({id:'user:DEMO-LC-'+i,source:'直接访问',strategy:null,preferred_language:i%2?'en':'zh',telegram_bound:i%2===0,email_bound:true,notification_preferences:{telegram:true,email:true},events:events.map(e=>({...e,session_id:'demo-lc-'+i,entry_source:'直接访问'}))}))
}
