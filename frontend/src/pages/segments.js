import {mountComparison} from '../comparison/panel.js'
import {mountLifecycle} from '../lifecycle/panel.js'
import {bindingGroups} from '../analytics/bindings.js'
import {computeSegmentation} from '../analytics/segmentation.js'
import {normalizeLanguage,languageLabel} from '../analytics/language.js'
export function createSegmentsPage(ctx){
 const {$,$$,day,asof,date,clock,esc,pct,table,stat,drill,dataStore,drawer,userButton,userTimeline,isMock}=ctx
 const clearNative=ctx.clear
 let users=[]
 const coverage=ctx.getCoverage()
 let comparisonCleanup=null
function drawSegments(c){
clearNative();users=ctx.getUsers();
const W7=7*day,W14=14*day,W28=28*day;
const pool=users.filter(u=>c.source==='all'||u.source===c.source);
const bindings=bindingGroups(pool),bindingFields={'已绑定 Telegram':'telegram_bound','已绑定邮箱':'email_bound'};
// Referral sets from dataStore
const inviterSet=new Set((dataStore.referrals||[]).map(r=>`user:${r.inviter_user_id}`));
const referredSet=new Set((dataStore.referrals||[]).map(r=>`user:${r.invitee_user_id}`));

// Build segments — a user can appear in multiple non-exclusive tags but only one primary segment
const segs={
  未激活:[],新激活:[],分析型:[],策略型:[],高频核心:[],
  流失风险:[],已流失:[],回流:[],邀请用户:[],交易用户:[]
};

const segmentation=computeSegmentation(pool,{asOf:asof,inviterIds:[...inviterSet],referredIds:[...referredSet]});
for(const [segment,ids] of Object.entries(segmentation.segmentUsers))segs[segment]=pool.filter(u=>ids.includes(u.id));
segs['邀请用户']=pool.filter(u=>inviterSet.has(u.id));
segs['中文用户']=pool.filter(u=>normalizeLanguage(u.preferred_language)==='zh');
segs['英文用户']=pool.filter(u=>normalizeLanguage(u.preferred_language)==='en');
segs['语言未知/其他']=pool.filter(u=>normalizeLanguage(u.preferred_language)===null);
segs['已绑定 Telegram']=bindings.telegram_bound.users;
segs['已绑定邮箱']=bindings.email_bound.users;
segs['交易用户']=pool.filter(u=>u.events.some(e=>e.type==='trade'&&e.t<=asof));

const segConfig={
  未激活:{icon:'○',desc:'登录后从未完成一次有效分析',action:'引导首次分析，降低冷启动门槛'},
  新激活:{icon:'★',desc:'7天内首次完成有效分析',action:'强化价值认知，推动二次分析'},
  分析型:{icon:'◆',desc:'有分析历史，近7天活跃，低频',action:'提升分析频率，引导开启AI策略'},
  策略型:{icon:'▲',desc:'使用过至少2种不同AI策略',action:'推动多策略交叉使用和交易转化'},
  高频核心:{icon:'●',desc:'28天内活跃≥6天',action:'保留体验，挖掘付费和推荐潜力'},
  流失风险:{icon:'△',desc:'28天内有分析，但近7天未活跃',action:'主动触达，用新信号或行情召回'},
  已流失:{icon:'×',desc:'超过28天未完成有效分析',action:'重激活活动，用优质信号或新功能'},
  回流:{icon:'↩',desc:'曾流失28天以上，近28天重新活跃',action:'强化留存，观察是否能进入核心分群'},
  邀请用户:{icon:'⊕',desc:'成功邀请过至少一位用户（非互斥）',action:'激励持续推荐，优化奖励结构'},
  中文用户:{icon:'文',desc:'用户选择的产品语言为中文',action:'使用中文内容和触达模板'},
  英文用户:{icon:'EN',desc:'用户选择的产品语言为英文',action:'使用英文内容和触达模板'},
  '语言未知/其他':{icon:'?',desc:'语言字段缺失或为其他语言，不猜测归属',action:'引导设置语言偏好'},
  '已绑定 Telegram':{icon:'✉',desc:'当前账号已绑定 Telegram（非互斥）',action:'按用户消息偏好提供Telegram提醒'},
  已绑定邮箱:{icon:'@',desc:'当前账号已绑定并验证邮箱（非互斥）',action:'按用户订阅偏好提供邮件通知'},
  交易用户:{icon:'$',desc:'完成过至少一笔交易（非互斥）',action:'关联分析与交易路径，提升复购'}
};

const exclusive=['未激活','新激活','分析型','策略型','高频核心','流失风险','已流失','回流'];
const nonExclusive=['邀请用户','交易用户','已绑定 Telegram','已绑定邮箱','中文用户','英文用户','语言未知/其他'];
const unavailable=n=>bindingFields[n]?bindings[bindingFields[n]].known===0:!isMock&&((n==='邀请用户'&&!dataStore.referrals)||(n==='交易用户'&&!dataStore.trades));
const total=Math.max(1,pool.length);

// Summary cards
const summaryRows=exclusive.map(n=>{
  const arr=segs[n];
  const lastActives=arr.map(u=>{const chips=u.events.filter(e=>e.type==='chip');return chips.length?Math.max(...chips.map(e=>e.t)):u.events[0]?.t||0});
  lastActives.sort((a,b)=>a-b);const mid=Math.floor(lastActives.length/2);const avgLast=lastActives.length?(lastActives.length%2?lastActives[mid]:Math.round((lastActives[mid-1]+lastActives[mid])/2)):null;
  return[
    `<button class="a-tablelink cursor-interaction" data-seg="${esc(n)}">${segConfig[n].icon} ${esc(n)}</button>`,
    `<button class="a-tablelink cursor-interaction" data-seg="${esc(n)}">${arr.length}</button>`,
    pct(arr.length,total),
    avgLast?date(avgLast)+'':' — ',
    esc(segConfig[n].desc)
  ]
});

$('#as-output').innerHTML=`<div class="a-context"><span class="a-chip">可运营用户分群 · 行为驱动</span><span>截至 ${clock(asof)} · 近7/28天行为 · ${c.source==='all'?'全部来源':c.source} · 共 ${pool.length} 位用户</span></div>`+
`<div class="a-summary a-four">${stat('高频核心用户',segs['高频核心'].length,'28天活跃≥6天')}${stat('新激活用户',segs['新激活'].length,'近7天首次分析')}${stat('流失风险',segs['流失风险'].length,'28天内有分析，近7天未活跃')}${stat('已流失',segs['已流失'].length,'超过28天未分析')}</div>`+
`<div class="a-card"><div class="a-cardhead"><h2>主要分群（互斥）</h2><span class="a-muted">点击分群名或人数查看用户列表</span></div>${table(['分群','人数','占比','最近活跃中位日','定义'],summaryRows)}<div class="a-insight">一个用户只归入一个主要分群。邀请、交易、Telegram绑定和邮箱绑定为附加标签，可同时拥有；中文/英文按用户选择的语言划分，缺失或其他语言单列。</div></div>`+
`<div class="a-card"><div class="a-cardhead"><h2>附加标签（非互斥）</h2><span class="a-muted">可与主要分群叠加</span></div>${table(['标签','人数','占比','定义','运营动作'],nonExclusive.map(n=>[`<button class="a-tablelink cursor-interaction" data-seg="${esc(n)}">${segConfig[n].icon} ${esc(n)}</button>`,unavailable(n)?'待获取':segs[n].length,unavailable(n)?'—':pct(segs[n].length,total),segConfig[n].desc,segConfig[n].action]))}</div>`+
`<div class="a-card"><div class="a-cardhead"><h2>运营优先级建议</h2><span class="a-muted">按分群影响力排序</span></div>${table(['分群','用户数','建议运营动作'],['高频核心','新激活','策略型','流失风险','回流','已流失','分析型','邀请用户','交易用户','已绑定 Telegram','已绑定邮箱','未激活'].map(n=>[`${segConfig[n].icon} ${n}`,unavailable(n)?'待获取':segs[n].length,segConfig[n].action]))}</div>`+
`<details class="a-card a-details"><summary>分群规则说明</summary><p>主要分群按优先级互斥分配：回流 → 已流失 → 流失风险 → 高频核心 → 策略型 → 新激活 → 分析型 → 未激活。</p><p>高频核心：近28天有效分析活跃天数≥6。策略型：历史使用过≥2种不同AI策略。新激活：距首次有效分析≤7天。回流：超过28天断档后近28天重新活跃。</p><p>邀请用户：在 referral 数据中作为 inviter 出现。交易用户：有至少一条 trade 类型事件。绑定标签取账号当前状态，解绑后不计；未知状态不当作未绑定。Telegram状态未知 ${bindings.telegram_bound.unknown} 人，邮箱状态未知 ${bindings.email_bound.unknown} 人；占比以当前用户池 ${pool.length} 人为分母。绑定不代表订阅通知。时区统一为 Asia/Bangkok。</p></details>`;

$$('[data-seg]').forEach(b=>b.onclick=()=>{
const n=b.dataset.seg,arr=segs[n]||[];
if(unavailable(n))return;
drawer.open({title:segConfig[n].icon+' '+n,description:segConfig[n].desc,rows:arr,columns:['用户ID','来源','最近分析','28天活跃天','关键行为'],renderRow:u=>{
const chips=u.events.filter(e=>e.type==='chip'&&e.t<=asof),ais=u.events.filter(e=>e.type==='ai'&&e.t<=asof),trades=u.events.filter(e=>e.type==='trade'&&e.t<=asof);
const last=chips.length?Math.max(...chips.map(e=>e.t)):null,days=new Set(chips.filter(e=>e.t>=asof-W28).map(e=>date(e.t))).size;
const tags=[chips.length?'分析'+chips.length+'次':'',ais.length?'AI'+ais.length+'次':'',trades.length?'交易'+trades.length+'次':'',inviterSet.has(u.id)?'邀请者':'',referredSet.has(u.id)?'被邀请':'',u.telegram_bound===true?'已绑定Telegram':'',u.email_bound===true?'已绑定邮箱':'',languageLabel(u.preferred_language)].filter(Boolean).join(' · ');
return[userButton(u),esc(u.source),last?date(last):'—',days?days+'天':'—',esc(tags)||'—']},onUser:userTimeline,note:'建议运营动作：'+segConfig[n].action});
});
const comparisonHost=document.createElement('div');$('#as-output .a-context').insertAdjacentElement('afterend',comparisonHost);
const comparisonTrades=dataStore.trades??null;
comparisonCleanup=mountComparison(comparisonHost,{users,asOf:asof,trades:comparisonTrades,referrals:dataStore.referrals??null,onDrill:drill,isMock,coverage,historyComplete:dataStore.meta.historyComplete,lockedPeriod:ctx.getAudiencePeriod()});
const lifecycleHost=document.createElement('div');if(Array.isArray(dataStore.lifecycleRules))$('#as-output').appendChild(lifecycleHost);mountLifecycle(lifecycleHost,{users:pool,asOf:asof,rules:dataStore.lifecycleRules,onDrill:drill,historyComplete:dataStore.meta.historyComplete,eventCoverage:coverage.events});
}

 return {draw:drawSegments,dispose(){comparisonCleanup?.();comparisonCleanup=null}}
}
