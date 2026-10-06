import {readFile,writeFile} from 'node:fs/promises';
import {MODULES,RAW_EVENT_TYPES} from '../src/analytics/events.js';
import {lifecycleDemoUsers} from '../src/lifecycle/mock.js';
import {createMockReferrals} from '../src/analytics/mockReferrals.js';
import {defaultChannels,UNKNOWN_CHANNEL} from '../src/channels/rules.js';
import {defaultRules} from '../src/lifecycle/rules.js';
import {normalizeApiResponse} from '../src/analytics/normalize.js';
const {createMockData}=await import('./seed.js');
const data=createMockData();
// 移到生成日的 UTC+7 13:00，让当前 API 模式的日期筛选能看到数据。
const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const asOf=Date.parse(today+'T13:00:00+07:00'),offset=asOf-data.meta.asOf;
const iso=t=>new Date(t+offset).toISOString();
const rawName=Object.fromEntries(Object.entries(RAW_EVENT_TYPES).filter(([,v])=>v).map(([k,v])=>[v,k]));
const users=data.users.map(u=>({user_id:u.id.replace(/^user:/,''),created_at:iso(Math.min(...u.events.map(e=>e.t))-60000),first_source:u.source,preferred_language:u.preferred_language,first_analysis_entry_module:u.events.find(e=>e.type==='chip')?.entry_module??null,telegram_bound:u.telegram_bound,email_bound:u.email_bound}));
const events=[];
for(const u of data.users){const user_id=u.id.replace(/^user:/,'');for(const [i,e] of u.events.entries()){
 const event_name=MODULES[e.type]?'module_viewed':rawName[e.type];if(!event_name)continue;
 const properties=Object.fromEntries(Object.entries({module:MODULES[e.type]?e.type:e.module,entry_module:e.entry_module,strategy_type:e.strategy,strategy_run_id:e.strategy_run_id??(e.type==='ai'?'run-'+user_id+'-'+i:undefined),result_id:e.result_id,token_visit_id:e.token_visit_id,token_address:e.token_address,chain:e.chain,position:e.position,item_id:e.item_id,referral_link_id:e.referral_link_id,inviter_user_id:e.inviter_user_id,share_type:e.share_type,share_method:e.share_method,content_id:e.content_id}).filter(([,v])=>v!=null));
 events.push({event_id:'evt-'+user_id+'-'+i,event_name,occurred_at:iso(e.t),user_id,anonymous_id:'anon-'+user_id,session_id:e.session_id??'session-'+user_id,first_entry_source:e.entry_source??u.source,properties});
}}
events.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at));
const referrals=data.referrals.map(r=>({...r,bound_at:iso(typeof r.bound_at==='number'?r.bound_at:Date.parse(r.bound_at))}));
const trades=users.filter((_,i)=>i%4===0).map((u,i)=>({trade_id:'trade-'+i,user_id:u.user_id,confirmed_at:new Date(asOf-(i%7)*86400000-3600000).toISOString(),volume_usd:100+i*17.5,status:'confirmed'}));
const startAt=data.meta.startAt+offset;
const normalized=normalizeApiResponse({events,users,referrals,trades,timezone:'Asia/Bangkok',startAt,asOf});
if(normalized.users.length!==users.length||!events.length)throw Error('Mock 归一化校验失败');
for(const [name,value] of Object.entries({users:{users},events:{events},referrals:{referrals},trades:{trades},channels:{rules:[...defaultChannels(),UNKNOWN_CHANNEL]},'lifecycle-rules':{rules:defaultRules()},manifest:{fixture_version:'v1',generated_at:new Date().toISOString(),as_of:new Date(asOf).toISOString(),start_at:new Date(startAt).toISOString(),timezone:'Asia/Bangkok',counts:{users:users.length,events:events.length,referrals:referrals.length,trades:trades.length},routes:{'/api/analytics/users':'users.json','/api/analytics/events':'events.json','/api/analytics/referrals':'referrals.json','/api/analytics/trades':'trades.json','/api/analytics/channels':'channels.json'}}}))await writeFile(new URL('./data/'+name+'.json',import.meta.url),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({users:users.length,events:events.length,referrals:referrals.length,trades:trades.length,asOf:new Date(asOf).toISOString()}));
