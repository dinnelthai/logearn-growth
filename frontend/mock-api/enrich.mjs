import {readFile,writeFile} from 'node:fs/promises';
const read=async n=>JSON.parse(await readFile(new URL('./data/'+n+'.json',import.meta.url),'utf8'));
const write=async(n,v)=>writeFile(new URL('./data/'+n+'.json',import.meta.url),JSON.stringify(v,null,2)+'\n');
const {users}=await read('users'),{events}=await read('events'),{referrals}=await read('referrals'),manifest=await read('manifest');
const asOf=Date.parse(manifest.as_of),DAY=86400000,H=3600000,iso=t=>new Date(t).toISOString();
const sources=['SEO','直接访问','Bot','社群','邀请','KOL/合作'];
// 显式场景样例覆盖八种主要分群与身份/路径边界；页面运行时不生成。
function addUser(id,index){let u=users.find(u=>u.user_id===id);if(!u){u={user_id:id,created_at:iso(asOf-50*DAY),first_source:sources[index%6],preferred_language:index%3===0?null:index%2?'en':'zh',first_analysis_entry_module:['callouts','signals','popular','fomo'][index%4],telegram_bound:index%5===0?null:index%2===0,email_bound:index%7===0?null:true};users.push(u)}return u}
function emit(u,name,t,session,props={}){const index=events.filter(e=>e.user_id===u.user_id).length;events.push({event_id:'scenario-'+u.user_id+'-'+index,event_name:name,occurred_at:iso(t),user_id:u.user_id,anonymous_id:'anon-'+u.user_id,session_id:session,first_entry_source:u.first_source,properties:props})}
function visit(u,t,index,{chip=true,ai=false,returnPath=false}={}){const session='scenario-session-'+u.user_id+'-'+index,props={token_address:'scenario-token-'+index,chain:'solana',token_visit_id:'scenario-visit-'+u.user_id+'-'+index,entry_module:u.first_analysis_entry_module};emit(u,'login_succeeded',t,session);emit(u,'module_viewed',t+1000,session,{module:props.entry_module});if(returnPath){emit(u,'module_viewed',t+2000,session,{module:'signals'});emit(u,'module_viewed',t+3000,session,{module:props.entry_module});emit(u,'module_viewed',t+4000,session,{module:'popular'})}emit(u,'token_opened',t+5000,session,{...props,module:props.entry_module,position:2});emit(u,'token_detail_viewed',t+10000,session,props);if(ai)emit(u,'strategy_started',t+20000,session,{...props,strategy_type:index%2?'1.5段':'日内2段',strategy_run_id:'run-'+u.user_id+'-'+index});if(chip)emit(u,'chip_analysis_viewed',t+30000,session,props)}
for(let i=0;i<32;i++){const id='SCENARIO-'+String(i).padStart(2,'0');if(users.some(u=>u.user_id===id))continue;const u=addUser(id,i),kind=i%8;
 if(kind===0)visit(u,asOf-2*DAY,0,{chip:false});
 if(kind===1)visit(u,asOf-2*DAY,0);
 if(kind===2){visit(u,asOf-20*DAY,0);visit(u,asOf-2*DAY,1)}
 if(kind===3){visit(u,asOf-20*DAY,0,{ai:true});visit(u,asOf-2*DAY,1,{ai:true})}
 if(kind===4)for(let d=0;d<10;d++)visit(u,asOf-(18-d)*DAY, d,{returnPath:d===0});
 if(kind===5)visit(u,asOf-12*DAY,0);
 if(kind===6)visit(u,asOf-40*DAY,0);
 if(kind===7){visit(u,asOf-42*DAY,0);visit(u,asOf-2*DAY,1,{returnPath:true})}
 // 核心用户近期再活跃，且中间保留成熟留存。
 if(kind===4)visit(u,asOf-DAY,11);
}
// 额外成熟批次：语言/来源/入口可对比，并保留D1..D7回访与不同转化损失。
for(let i=0;i<48;i++){const id='COHORT-'+String(i).padStart(2,'0');if(users.some(u=>u.user_id===id))continue;const u=addUser(id,i+32);u.created_at=iso(asOf-25*DAY);const t=asOf-(12+i%3)*DAY-H;visit(u,t,0,{ai:i%3!==0,returnPath:i%8===0});for(let d=1;d<=7;d++)if((i+d)%4!==0)visit(u,t+d*DAY,d,{ai:d%3===0});if(i%4===0)visit(u,asOf-DAY-H,9)}
// 覆盖结果生成/查看配对与路径返回。
for(let i=0;i<6;i++){if(events.some(e=>e.properties?.strategy_run_id==='run-signal-'+i))continue;const u=users.find(u=>u.user_id==='COHORT-'+String(i).padStart(2,'0')),t=asOf-2*DAY;const run='run-signal-'+i,result='result-signal-'+i,session='signal-session-'+i;emit(u,'strategy_started',t,session,{strategy_run_id:run,strategy_type:'1.5段'});emit(u,'strategy_result_generated',t+H/2,session,{strategy_run_id:run,result_id:result});if(i%2===0)emit(u,'strategy_signal_viewed',t+H,session,{strategy_run_id:run,result_id:result})}
// 所有渠道都具备独立成交事实，避免按数组步长采样造成某些渠道没有交易。
const trades=users.filter((_,i)=>(i*7)%11<4).flatMap((u,i)=>[0,1].map(j=>({trade_id:'trade-v2-'+u.user_id+'-'+j,user_id:u.user_id,confirmed_at:iso(asOf-(1+(i+j)%7)*DAY-H),volume_usd:80+(i*37+j*29)%2500,status:'confirmed'})));
events.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at));manifest.fixture_version='v2-complete';manifest.start_at=iso(asOf-49*DAY);manifest.counts={users:users.length,events:events.length,referrals:referrals.length,trades:trades.length};manifest.scenarios=['八类主要分群','中文/英文/未知语言','绑定/未绑定/未知绑定','成熟D1-D7留存','模块返回路径 A-B-A-C','策略结果已查看/未查看','各渠道交易事实'];
await write('users',{users});await write('events',{events});await write('trades',{trades});await write('manifest',manifest);await import('./generate-channels.mjs');
console.log(JSON.stringify(manifest.counts));
