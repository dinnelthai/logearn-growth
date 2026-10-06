import {MODULES} from '../src/analytics/events.js';
import {lifecycleDemoUsers} from '../src/lifecycle/mock.js';
import {createMockReferrals} from '../src/analytics/mockReferrals.js';
export function createMockData(){
const day=86400000,base=Date.parse('2026-09-21T00:00:00+07:00'),asof=Date.parse('2026-10-05T13:00:00+07:00'),sources=['SEO','直接访问','Bot','社群','邀请','KOL/合作'];let seed=314159;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const users=Array.from({length:560},(_,i)=>{
const source=sources[i%6],t=base+(i%14)*day+(8+Math.floor(rand()*12))*3600000;
const strategy=rand()<.55?'1.5段':'日内2段',events=[{type:'login',t,session_id:'session-'+i+'-0'}];
const visit=(loginT,withAi,withChip,index)=>{
const fields={token_address:'mock-token-'+(i%24),chain:'solana',token_visit_id:'visit-'+i+'-'+index,session_id:'session-'+i+'-'+index};
const entry_module=Object.keys(MODULES)[(i+index)%4];
events.push({type:entry_module,t:loginT+15000,...fields,module:entry_module});
events.push({type:'token_click',t:loginT+30000,...fields,entry_module,position:i%10+1});
const detailT=loginT+60000;events.push({type:'token',t:detailT,...fields,entry_module});
const aiT=detailT+(1+Math.floor(rand()*100))*60000;
if(withAi)events.push({type:'ai',t:aiT,strategy,...fields});
if(withChip)events.push({type:'chip',t:(withAi?aiT:detailT)+(5+Math.floor(rand()*190))*60000,...fields});
};
const withAi=rand()<({SEO:.67,'直接访问':.58,Bot:.79,'社群':.45,'邀请':.72,'KOL/合作':.54}[source]);
if(withAi||rand()<.65)visit(t,withAi,rand()<(withAi?.68:.6),0);
const first=events.find(e=>e.type==='chip');
if(first)for(let d=1;d<=7;d++)if(rand()<[0,.48,.36,.30,.29,.24,.22,.26][d]){
const rt=first.t+d*day;if(rt<asof){events.push({type:'login',t:rt,session_id:'session-'+i+'-'+d});visit(rt,rand()<.5,true,d)}
}
return{id:'user:LE'+String(10000+i),source,strategy,telegram_bound:i%5<2,email_bound:i%7<4,events:events.filter(e=>e.t<=asof).map((e,j)=>({...e,entry_source:e.type==='login'?source:sources[(i+j)%6]})).sort((a,b)=>a.t-b.t)}
});
users.forEach((u,i)=>{u.preferred_language=i%10===0?null:i%3===0?'en':'zh'});
users.push(...lifecycleDemoUsers(asof));
const referrals=createMockReferrals(users);users.forEach(u=>u.events.sort((a,b)=>a.t-b.t));
return{
meta:{version:'mock-v1',startAt:base,asOf:asof,timezone:'Asia/Bangkok',source:'mock'},
users,
referrals,
channelProfiles:{SEO:{login:.46,active:.31,d7:.22,trade:.09,pay:.025,vol:480},'直接访问':{login:.62,active:.44,d7:.31,trade:.14,pay:.041,vol:720},Bot:{login:.74,active:.57,d7:.39,trade:.21,pay:.058,vol:980},'社群':{login:.58,active:.43,d7:.35,trade:.16,pay:.047,vol:810},'邀请':{login:.71,active:.61,d7:.48,trade:.24,pay:.072,vol:1120},'KOL/合作':{login:.51,active:.36,d7:.27,trade:.12,pay:.035,vol:650}},
segmentProfiles:{'新手型':{ea:24,w4:8,trade:3,pay:1.2,amount:180,need:'找什么、怎么看懂'},'成长型':{ea:58,w4:31,trade:18,pay:9.6,amount:1450,need:'稳定发现机会并形成方法'},'专业型':{ea:83,w4:62,trade:47,pay:28,amount:8600,need:'速度、深度与批量能力'},'沉默型':{ea:9,w4:3,trade:2,pay:.8,amount:120,need:'重新证明价值并解决体验问题'}}
};
}
