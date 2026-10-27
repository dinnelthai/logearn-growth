// Optional old modules: node --expose-gc backend/test/performance.bench.cjs <comparison-baseline> <invite-baseline>
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),path=require('node:path')
function measure(label,current,baseline,args,scale){
 let reference,results={}
 for(const [version,fn]of [...(baseline?[['baseline',baseline]]:[]),['current',current]]){
  const samples=[]
  for(let i=0;i<3;i++){
   global.gc?.();const start=performance.now(),result=fn(...args);samples.push(performance.now()-start)
   if(version==='baseline')reference=result;else if(reference)assert.deepEqual(result,reference)
  }
  results[version]={median_ms:+samples.sort((a,b)=>a-b)[1].toFixed(2)}
 }
 console.log(JSON.stringify({label,synthetic:true,...scale,results,output_equal:baseline?true:null}))
}
const users=5000,events=[],trades=[],specs=[],period={start:0,end:1000000},snapshot={snapshot_cutoff:new Date(1000000).toISOString()}
for(let i=0;i<users;i++)for(let j=0;j<20;j++){
 events.push({event_id:i+':'+j,user_id:String(i),t:1000+j})
 trades.push({transaction_hash:i+':'+j,account_id:String(i),chain:'eth',valid:true,trade_value:j+.1,transaction_time:new Date(2000+j).toISOString()})
}
for(let i=0;i<100;i++)specs.push({id:'scope:'+i,members:Array.from({length:50},(_,j)=>({id:String(i*50+j)}))})
measure('operations-comparison',require('../src/analytics/operationsComparison').compareFacts,process.argv[2]?require(path.resolve(process.argv[2])).compareFacts:null,[specs,{events,trades,known:new Set(Array.from({length:users},(_,i)=>String(i))),errors:{}},period,snapshot],{scopes:100,users,events:events.length,trades:trades.length})
const flows=8000,input=Array.from({length:flows},(_,i)=>({id:'user:'+i,source:'x',events:[{raw_name:'invite_link_visited',t:2000,event_id:'e:'+i,actor_user_id:null,properties:{invite_flow_id:'flow:'+i,referral_link_id:'link:'+i,campaign_id:'campaign:'+i}}]}))
measure('invite-dimensions',require('../src/analytics/inviteConversion').inviteConversion,process.argv[3]?require(path.resolve(process.argv[3])).inviteConversion:null,[input,[],{start:1000,end:100000,hours:1},snapshot],{flows,distinct_links:flows,distinct_campaigns:flows})
