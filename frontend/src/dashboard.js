import {renderInputQuality} from './pages/inputQuality.js';
import {createNorthStarPage} from './pages/northStar.js';
import {createNorthStarAggPage} from './pages/northStarAgg.js';
import {createFunnelPage} from './pages/funnel.js';
import {createReferralPage} from './pages/referral.js';
import {createSegmentsPage} from './pages/segments.js';
import {periodCoverage,coverageLabel} from './analytics/coverage.js';
import {createRetentionPage} from './pages/retention.js';
import {createTradeMonitorPage} from './pages/tradeMonitor.js';
import {createTradeMonitorAggPage} from './pages/tradeMonitorAgg.js';
import {createPathsPage} from './pages/paths.js';
import {createPathsAggPage} from './pages/pathsAgg.js';
import {createChannelsAggPage} from './pages/channelsAgg.js';
import {createFunnelAggPage} from './pages/funnelAgg.js';
import {createRetentionAggPage} from './pages/retentionAgg.js';
import {createSegmentsAggPage} from './pages/segmentsAgg.js';
import {createReferralAggPage} from './pages/referralAgg.js';
import {createAudience,audienceUsers,audiencePeriod,AUDIENCE_MODES} from './analytics/audience.js';
import {mountCohortManager} from './pages/cohortManager.js';
import { mountChannelAnalytics } from './channels/analyticsPanel.js';
import { mountChannels } from './channels/panel.js';
import { EVENT_LABELS, MODULES } from './analytics/events.js';
import { createDrawer } from './drawer.js';
import { loadConfig, saveConfig } from './analytics/configStorage.js';
(()=>{
const root=document.getElementById('la-studio'), $=s=>root.querySelector(s), $$=s=>[...root.querySelectorAll(s)];
let channelCleanup=null,channelChartsCleanup=null;
let audience=null;
let cohortManager=null;
const drawer=createDrawer($('#as-drill'),{getContext:()=>current??config(),onAnalyze:selection=>{audience=createAudience(selection);navigate(selection.mode);}});const closeDrill=()=>drawer.close();
const DATA_CONTRACT={
version:'1.0.0',
meta:['startAt','asOf','timezone','source'],
user:['id','source','strategy','events','telegram_bound','email_bound','preferred_language'],
event:['type','t','entry_source','strategy','token_address','chain','token_visit_id','session_id','module','entry_module','item_id','position','referral_link_id','inviter_user_id','share_type','share_method','content_id'],
eventTypes:EVENT_LABELS,
channelProfile:['login','active','d7','trade','pay','vol'],
segmentProfile:['ea','w4','trade','pay','amount','need']
};
const dataStore=globalThis.LOGEARN_ANALYTICS_DATA;
const isMock=false;
const isAgg=dataStore.meta.source==='backend-agg';
$('[data-mode="value"]').hidden=true;
if(!Array.isArray(dataStore.channelRules))$('[data-mode="channels"]').hidden=true;
if(!isAgg){
  if(!Array.isArray(dataStore.referrals)&&!(dataStore.users||[]).some(u=>u.events.some(e=>['share_click','share_complete','invite_visit'].includes(e.type))))$('[data-mode="referral"]').hidden=true;
}
const eventCount=isAgg
  ?(dataStore.meta.eventCount||0)
  :dataStore.users.reduce((n,u)=>n+u.events.length,0)
$('#as-data-badge').textContent=dataStore.meta.source==='json'
  ?'JSON 数据'
  :dataStore.meta.source==='backend-agg'
    ?`聚合模式 · ${Number(eventCount).toLocaleString('en-US')} 事件`
  :dataStore.meta.source==='backend'
    ?`后端数据 · ${Number(eventCount).toLocaleString('en-US')} 事件`
    :'接口数据';
$('#as-data-status').textContent=dataStore.meta.source==='backend-agg'
  ?`服务端聚合模式：浏览器不加载明细事件。北极星 / 渠道 / 交易 / 漏斗 / 留存 / 分群 / 推荐 / 行为路径 / 人群对比走 /api/metrics；下钻走 /api/drill。对比留存/趋势视图仍待补齐。`
  :dataStore.meta.source==='backend'
  ?`数据来自本地 SQLite（/api/analytics），共 ${Number(eventCount).toLocaleString('en-US')} 条已归一化事件；未提供的数据模块不展示。`
  :'所有展示指标仅由已加载的事实数据计算；未提供的数据模块不展示。';
if(!dataStore.meta.historyComplete)$('#as-data-status').textContent+=' 历史覆盖未确认：缺少历史首次事实的用户按首次观测行为判断，首次用户、留存和生命周期结果可能不完整。';
if(dataStore.availability && Object.values(dataStore.availability).includes('error'))$('#as-data-status').textContent+=' 部分接口请求失败，对应指标暂不可用。';
if(!isAgg)renderInputQuality({root,quality:dataStore.inputQuality});
$('#as-data-time').textContent='观测截至 '+new Date(dataStore.meta.asOf+7*3600000).toISOString().slice(0,16).replace('T',' ')+' · UTC+7';
const names=DATA_CONTRACT.eventTypes,day=86400000,base=dataStore.meta.startAt,asof=dataStore.meta.asOf,allUsers=dataStore.users||[];
const usersById=new Map(allUsers.map(u=>[u.id,u]));
let users=allUsers;
globalThis.LogEarnAnalyticsData={contract:DATA_CONTRACT,snapshot:dataStore,isMock:dataStore.meta.source==='mock',isAgg};
const fmt=n=>n.toLocaleString('en-US'),pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'—',date=t=>new Date(t+7*3600000).toISOString().slice(5,10).replace('-','/'),clock=t=>new Date(t+7*3600000).toISOString().slice(5,16).replace('T',' '),daynum=t=>Math.floor((t-base)/day), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(heads,rows)=>`<div class="a-scroll"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const stat=(l,v,s)=>`<div class="a-stat"><div class="a-muted">${l}</div><div class="a-statvalue">${v}</div><div class="a-muted">${s}</div></div>`;
$('#as-source').innerHTML='<option value="all">全部来源</option>'+[...new Set(users.flatMap(u=>[u.source,...u.events.map(e=>e.entry_source)].filter(Boolean)))].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
$('#as-strategy').innerHTML='<option value="all">全部策略</option>'+[...new Set(users.flatMap(u=>u.events.map(e=>e.strategy).filter(Boolean)))].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
let mode='north',steps=['login','token','ai','chip'],dirty=false,saved=null,current=null;
function config(){const period=$('#as-range').value,end=Math.floor((asof+7*3600000)/day)*day-7*3600000,start=period==='all'?Math.floor((base+7*3600000)/day)*day-7*3600000:end-Number(period)*day,range=Math.ceil((end-start)/day);return audiencePeriod({mode,association:$('#as-association').value,steps:[...steps],range,period,hours:+$('#as-window').value,source:mode==='north'?'all':$('#as-source').value,strategy:$('#as-strategy').value,start,end,initial:$('#as-initial')?.value||'chip',returning:$('#as-return')?.value||'chip',pathStart:$('#as-path-start')?.value||'all',pathDepth:+($('#as-path-depth')?.value||5),audienceIds:audience?.ids? [...audience.ids]:null,cohortId:audience?.cohortId||null},audience)}
function renderAudience(){
 let host=$('#as-audience');
 if(!host){host=document.createElement('div');host.id='as-audience';host.className='a-audience';$('#as-data-status').insertAdjacentElement('afterend',host)}
 host.hidden=!audience;
 $('#as-save').disabled=!!audience;$('#as-restore').disabled=!!audience;
 if(!audience)return;
 const applied=AUDIENCE_MODES.has(mode);
 host.innerHTML=`<div><strong>${applied?'当前分析人群':'已保留分析人群'}：${esc(audience.title)} · ${audience.ids.length} 人</strong><p>${esc(audience.description)}${audience.query?' · 搜索：'+esc(audience.query):''} · ${date(audience.start)}–${date(audience.end-day)}${applied?' · 用户名单固定，可在此人群内继续筛选':' · 当前页面展示全平台'}</p>${mode==='retention'?'<p>留存描述所选用户的回访情况，分母为其中符合首次行为入组条件的用户。</p>':''}</div><div class="a-audience-actions"><button class="a-button" data-audience-go="funnel">漏斗</button><button class="a-button" data-audience-go="paths">行为路径</button><button class="a-button" data-audience-go="retention">留存</button><button class="a-button" data-audience-clear>清除人群</button></div>`;
 host.querySelectorAll('[data-audience-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.audienceGo));
 host.querySelector('[data-audience-clear]').onclick=()=>{audience=null;users=allUsers;renderSteps();$('#as-source').value='all';run()};
}
function mountCohorts(){
 const host=$('#as-cohort-mount');if(!host)return;
 if(cohortManager){cohortManager.dispose();cohortManager=null}
 cohortManager=mountCohortManager(host,{
  allUsers,asof,day,esc,
  onApply(aud){audience=aud;navigate('funnel')}
 })
}
function markDirty(){dirty=true;$('#as-run').textContent='应用修改';$('#as-stale').hidden=false;$('#as-dirty').textContent='配置已修改，点击运行更新结果';$('#as-saved').textContent=''}
function northDefinition(){if(mode!=='north')return;const c=config(),label=c.period==='all'?'全周期（已加载数据）':'最近'+c.range+'天';$('#as-stepcount').textContent=label;$('#as-steps').innerHTML=`<p><strong>有效分析用户</strong></p><p class="a-muted">${date(c.start)}–${date(c.end-day)}，至少成功看到一次筹码峰的用户。</p><p class="a-muted">周期人数按用户去重；每日人数按天去重，包含首次分析和回访分析。</p><p class="a-muted">日均 = 每日有效分析人数之和 ÷ ${c.range} 个业务日。按 UTC+7 统计至最近完整一天。</p>${c.period==='all'?'<p class="a-muted">全周期仅覆盖当前已加载的数据历史。</p>':''}`;}
function rangeOptions(){if(audience&&AUDIENCE_MODES.has(mode)){const select=$('#as-range');select.innerHTML=`<option value="audience">人群原统计期 · ${date(audience.start)}–${date(audience.end-day)}</option>`;return}const select=$('#as-range'),old=select.value,end=Math.floor((asof+7*3600000)/day)*day-7*3600000;select.innerHTML=(mode==='north'?['all','7','14','30']:['7','14']).map(v=>`<option value="${v}">${v==='all'?'全周期':'最近'+v+'天'} · ${date(v==='all'?Math.floor((base+7*3600000)/day)*day-7*3600000:end-Number(v)*day)}–${date(end-day)}</option>`).join('');select.value=[...select.options].some(o=>o.value===old)?old:'14';}
function renderSteps(){root.classList.toggle('a-north-page',mode==='north');const toolbar=$('#as-north-toolbar');if(toolbar)toolbar.hidden=mode!=='north';rangeOptions();$('#as-source').closest('label').hidden=mode==='north';if(mode!=='channels')$('#as-source').innerHTML='<option value="all">全部来源</option>'+[...new Set(users.flatMap(u=>[u.source,...u.events.map(e=>e.entry_source)].filter(Boolean)))].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''); $('#as-range').disabled=mode==='segments'||!!(audience&&AUDIENCE_MODES.has(mode));$('#as-range-note').hidden=mode!=='segments'; $('#as-source-caption').textContent=mode==='funnel'?'首次获客来源':mode==='referral'?'推荐用户首次来源':'首次获客来源'; $('#as-config-title').textContent=mode==='funnel'?'漏斗步骤':'留存行为';$('#as-stepcount').textContent=mode==='funnel'?steps.length+' 步':'D1–D7';$('#as-add').hidden=mode!=='funnel';$('#as-presets').hidden=mode!=='funnel';$('#as-association-label').hidden=mode!=='funnel';if(mode==='funnel')$('#as-preset').value=JSON.stringify(steps)===JSON.stringify(['token_click','token','chip'])?'token_visit':JSON.stringify(steps)===JSON.stringify(['ai','strategy_result','signal_view'])?'strategy_run':JSON.stringify(steps)===JSON.stringify(['login','token','ai','chip'])?'ai':JSON.stringify(steps)===JSON.stringify(['login','token','chip'])?'overall':'custom';$('#as-add').disabled=steps.length>=5;$('#as-window-label').hidden=mode!=='funnel';$('#as-strategy-label').hidden=mode!=='funnel';$('#as-strategy-note').hidden=mode!=='funnel';if(mode==='channels'){$('#as-source').innerHTML='<option value="all">全部渠道</option>'+(dataStore.channelRules??[]).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');$('#as-config-title').textContent='渠道归因口径';$('#as-stepcount').textContent='首次来源';$('#as-source-caption').textContent='查看指定渠道';$('#as-steps').innerHTML=`<p><strong>首次来源</strong></p><p class="a-muted">用户首次到访时绑定渠道，后续访问不覆盖，用于比较获客质量。</p><p><strong>最近来源</strong></p><p class="a-muted">记录用户本次访问来源，用于活动短期效果分析。</p><p class="a-muted">当前按首次获客来源统计；来源参数未匹配规则时归入未知渠道。</p>`;return}if(mode==='segments'){$('#as-config-title').textContent='分群规则';$('#as-stepcount').textContent='行为成熟度';$('#as-source-caption').textContent='用户首次来源';$('#as-steps').innerHTML=`<p><strong>按观测截至时间分群</strong></p><p class="a-muted">优先级：回流 → 已流失 → 流失风险 → 高频核心 → 策略型 → 新激活 → 分析型 → 未激活。</p><p class="a-muted">近28天分析≥6天为高频核心；使用≥2种不同AI策略为策略型；最近7天无分析为流失风险，最近28天无分析为已流失。</p><p class="a-muted">回流需存在至少28天的分析间隔，且回归发生在近28天。</p><div id="as-cohort-mount" style="margin-top:16px;border-top:1px solid var(--a-border);padding-top:14px"></div>`;mountCohorts();return}if(mode==='referral'){$('#as-config-title').textContent='增长循环口径';$('#as-stepcount').textContent='按推荐关系去重';$('#as-source-caption').textContent='推荐用户首次来源';$('#as-steps').innerHTML=`<p>有效推荐系数 K</p><p class="a-muted">每位参与推荐用户带来的新有效分析用户数。</p><p class="a-muted">按推荐关系绑定时间入组，绑定后7天内完成有效分析为激活。</p>`;return}if(mode==='north'){$('#as-config-title').textContent='指标定义';northDefinition();return}if(mode==='trade-monitor'){$('#as-config-title').textContent='监控口径';$('#as-stepcount').textContent='按笔数统计';$('#as-source-caption').textContent='用户首次来源';$('#as-steps').innerHTML=`<p><strong>成功率 = 关联成功的提交笔数 / 提交笔数</strong></p><p class="a-muted">按交易尝试 ID / 交易 ID 去重，同一用户多笔均计；缺少关联 ID 不计算成功率。</p><p class="a-muted">失败原因来自 properties.reason 字段。</p>`;return}if(mode==='paths'){$('#as-config-title').textContent='路径设置';$('#as-stepcount').textContent='按会话统计';$('#as-source-caption').textContent='用户首次来源';$('#as-steps').innerHTML=`<label>路径起点<select id="as-path-start"><option value="all">会话首次行为</option>${Object.entries(names).filter(([k])=>k!=='strategy_heartbeat').map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label><label>最多展示行为步数<select id="as-path-depth"><option value="3">3 步</option><option value="5" selected>5 步</option><option value="7">7 步</option></select></label><p class="a-muted">展示实际发生的行为，不要求完成固定漏斗。连续相同事件合并，跨步骤重复行为保留。</p>`;$('#as-path-start').onchange=markDirty;$('#as-path-depth').onchange=markDirty;return}if(mode==='retention'){$('#as-steps').innerHTML=`<label>首次行为<select id="as-initial">${Object.entries(names).map(([k,n])=>`<option value="${k}" ${k==='chip'?'selected':''}>${n}</option>`).join('')}</select></label><label>回访行为<select id="as-return">${Object.entries(names).map(([k,n])=>`<option value="${k}" ${k==='chip'?'selected':''}>${n}</option>`).join('')}</select></label><p class="a-muted">以首次行为发生日为 D0</p>`;$('#as-initial').onchange=markDirty;$('#as-return').onchange=markDirty;return}
$('#as-steps').innerHTML=steps.map((s,i)=>`<div class="a-step"><div class="a-stephead"><span class="a-number">步骤 ${i+1}</span><div><button class="a-iconbtn cursor-interaction" data-up="${i}" aria-label="上移步骤 ${i+1}" ${i===0?'disabled':''}>↑</button><button class="a-iconbtn cursor-interaction" data-down="${i}" aria-label="下移步骤 ${i+1}" ${i===steps.length-1?'disabled':''}>↓</button><button class="a-iconbtn cursor-interaction" data-del="${i}" aria-label="删除步骤 ${i+1}" ${steps.length<=2?'disabled':''}>×</button></div></div><select data-event="${i}" aria-label="步骤 ${i+1} 事件">${Object.entries(names).map(([k,n])=>`<option value="${k}" ${k===s?'selected':''}>${n}</option>`).join('')}</select></div>`).join('');$$('[data-event]').forEach(el=>el.onchange=()=>{steps[+el.dataset.event]=el.value;$('#as-preset').value='custom';markDirty()});$$('[data-up]').forEach(el=>el.onclick=()=>{let i=+el.dataset.up;[steps[i-1],steps[i]]=[steps[i],steps[i-1]];renderSteps();markDirty()});$$('[data-down]').forEach(el=>el.onclick=()=>{let i=+el.dataset.down;[steps[i+1],steps[i]]=[steps[i],steps[i+1]];renderSteps();markDirty()});$$('[data-del]').forEach(el=>el.onclick=()=>{steps.splice(+el.dataset.del,1);renderSteps();markDirty()});}
function userTimeline(id,host){const u=usersById.get(id);if(!u)return;host.innerHTML=`<h2>${esc(u.id)} · 事件时间线</h2><div class="a-timeline">${u.events.map(e=>`<div class="a-event"><strong>${esc(names[e.type]||e.type)}</strong><div>${clock(e.t)}</div>${e.strategy?`<span class="a-muted">${esc(e.strategy)}</span>`:''}</div>`).join('')}</div>`}
function userButton(u){return `<button class="a-tablelink cursor-interaction" data-user="${esc(u.id)}">${esc(u.id)}</button>`}
function drill(title,rows,desc,context){drawer.open({title,context,description:desc,rows,columns:['用户','来源（当前分析口径）','首次事件','事件记录'],renderRow:r=>{const u=r.u||r;return[userButton(u),esc(r.displaySource||u.source),u.events[0]?clock(u.events[0].t):'—',u.events.length+' 条']},onUser:userTimeline,note:'点击用户ID查看事件时间线。'})}

const themeMedia=matchMedia('(prefers-color-scheme: dark)');
function clearNative(){Object.values(pages).forEach(page=>page.dispose());if(channelChartsCleanup){channelChartsCleanup();channelChartsCleanup=null}if(channelCleanup){channelCleanup();channelCleanup=null}}
function drawFunnel(c){pages.funnel.draw(c)}
function drawRetention(c){pages.retention.draw(c)}

const coverage=dataStore.meta.coverage??{};
const covered=(source,start,end)=>periodCoverage(coverage[source],start,end)==='complete';
function renderCoverage(c){let host=$('#as-coverage');if(!host){host=document.createElement('div');host.id='as-coverage';host.className='a-status';$('#as-data-status').after(host)}const ev=coverageLabel(periodCoverage(coverage.events,c.start,c.end)),tr=coverageLabel(periodCoverage(coverage.trades,c.start,c.end));host.textContent=`所选周期：行为${ev}；交易${Array.isArray(dataStore.trades)?tr:'未提供'}。${covered('events',c.start,c.end)?'':'行为人数为已观测记录，不能据此确认完整零值。'}${Array.isArray(dataStore.trades)&&!covered('trades',c.start,c.end)?'交易金额为已观测金额，未覆盖日期不填零。':''}${dataStore.meta.historyComplete?'':'历史首次/流失判断仍受加载历史限制。'}`}
function drawNorth(c){pages.north.draw(c)}
function drawReferral(c){pages.referral.draw(c)}

function drawChannels(c){
if(isAgg){pages.channelsAgg.draw(c);return}
clearNative();$('#as-output').innerHTML='';
if(dataStore.channelRules){const report=document.createElement('div');$('#as-output').append(report);channelChartsCleanup=mountChannelAnalytics(report,{rules:dataStore.channelRules??[],users,trades:dataStore.trades,startAt:c.start,endAt:c.end,asOf:asof,channel:c.source,coverage,onDrill:drill});}
if(Array.isArray(dataStore.channelRules)){const details=document.createElement('details');details.className='a-card a-details';details.innerHTML='<summary>渠道管理 · 查看匹配规则</summary>';const manager=document.createElement('div');details.append(manager);$('#as-output').append(details);channelCleanup=mountChannels(manager,{isMock:false,initialRules:dataStore.channelRules,jsonMode:dataStore.meta.source==='json'});}
}

function drawTradeMonitor(c){pages.tradeMonitor.draw(c)}

function drawSegments(c){pages.segments.draw(c)}

function drawValueLoop(c){clearNative();$('#as-output').innerHTML='';}

function drawPaths(c){pages.paths.draw(c)}

function pageTitle(){return mode==='north'?'北极星指标 · 有效分析用户':mode==='channels'?'渠道分析':mode==='paths'?'行为路径分析':mode==='funnel'?'用户激活漏斗':mode==='retention'?'有效分析留存':mode==='referral'?'推荐与增长循环':mode==='value'?'价值闭环':mode==='trade-monitor'?'交易成功率监控':'用户分群分析'}
function pageSub(){return mode==='north'?'有多少用户真正获得了筹码分析的价值':mode==='channels'?'用户从哪里来，哪些渠道真正带来留存、交易和付费':mode==='paths'?'用户先做什么、接着去哪，以及在哪里结束观察':mode==='funnel'?'从登录、Token详情、AI策略到有效分析，定位转化损失':mode==='retention'?'从首次使用到持续回访，比较各批次表现':mode==='referral'?'每个有效分析用户能否持续带来新的有效分析用户':mode==='value'?'看完筹码分析后，是否真的发生了交易和价值':mode==='trade-monitor'?'基于 trade_submitted / trade_succeeded / trade_failed 事件，实时监控交易成功率':'哪些用户的需求与表现不同，谁更容易交易和付费'}
function unsupportedAgg(label){clearNative();$('#as-output').innerHTML=`<div class="a-card a-details"><h2>${esc(label)} · 聚合模式待迁移</h2><p>当前数据量已启用服务端聚合。本页将在后续 Phase 接入 <code>/api/metrics</code>；在此之前不加载明细、也不显示假零。</p><p class="a-muted">已支持：北极星、渠道、交易、漏斗、留存、分群、推荐、行为路径。</p></div>`}
function run(){users=audienceUsers(allUsers,audience,mode);renderAudience();northDefinition();current=config();renderCoverage(current);dirty=false;$('#as-run').textContent='运行分析';$('#as-stale').hidden=true;$('#as-dirty').textContent='已应用当前配置';closeDrill();if(isAgg&&!['north','channels','trade-monitor','funnel','retention','segments','referral','paths'].includes(mode)){unsupportedAgg(pageTitle());return}if(!isMock&&!isAgg&&!Array.isArray(dataStore.trades)&&((mode==='funnel'&&current.steps.includes('trade'))||(mode==='retention'&&[current.initial,current.returning].includes('trade')))){clearNative();$('#as-output').innerHTML='<div class="a-card a-details"><h2>交易数据待获取</h2><p>当前分析包含交易步骤，需先取得交易数据。</p></div>';return}mode==='north'?drawNorth(current):mode==='channels'?drawChannels(current):mode==='paths'?drawPaths(current):mode==='funnel'?drawFunnel(current):mode==='retention'?drawRetention(current):mode==='referral'?drawReferral(current):mode==='value'?drawValueLoop(current):mode==='trade-monitor'?drawTradeMonitor(current):drawSegments(current)}
function navigate(nextMode){mode=nextMode;$$('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.mode===mode));$$('.a-nav-parent').forEach(p=>{const active=p.nextElementSibling?.querySelector(`[data-mode="${mode}"]`);p.classList.toggle('is-active',!!active);if(active)active.classList.add('is-active');});$('#as-title').textContent=pageTitle();$('#as-sub').textContent=pageSub();renderSteps();run()}
const pageContext={dataStore,usersById,drawer,userButton,userTimeline,isMock,isAgg,setPeriod:value=>{$('#as-range').value=value;run()},getAudiencePeriod:()=>audience&&AUDIENCE_MODES.has(mode)?{startAt:audience.start,endAt:audience.end}:null,root,$,$$,names,day,base,asof,date,clock,daynum,esc,fmt,pct,table,stat,drill,closeDrill,themeMedia,getUsers:()=>users,getTradeQuality:()=>dataStore.tradeQuality,getCoverage:()=>coverage,historyComplete:dataStore.meta.historyComplete,clear:clearNative};
const pages={
  north:isAgg?createNorthStarAggPage(pageContext):createNorthStarPage(pageContext),
  channelsAgg:createChannelsAggPage(pageContext),
  funnel:isAgg?createFunnelAggPage(pageContext):createFunnelPage(pageContext),
  referral:isAgg?createReferralAggPage(pageContext):createReferralPage(pageContext),
  segments:isAgg?createSegmentsAggPage(pageContext):createSegmentsPage(pageContext),
  paths:isAgg?createPathsAggPage(pageContext):createPathsPage(pageContext),
  tradeMonitor:isAgg?createTradeMonitorAggPage(pageContext):createTradeMonitorPage(pageContext),
  retention:isAgg?createRetentionAggPage(pageContext):createRetentionPage(pageContext),
};
$$('[data-mode]').forEach(b=>b.onclick=()=>navigate(b.dataset.mode));$('#as-add').onclick=()=>{if(steps.length<5){steps.push('chip');renderSteps();markDirty()}};['#as-range','#as-window','#as-source','#as-strategy','#as-association'].forEach(s=>$(s).onchange=()=>{northDefinition();markDirty()});$('#as-run').onclick=run;$('#as-preset').onchange=()=>{const v=$('#as-preset').value;if(v==='custom')return;steps=v==='token_visit'?['token_click','token','chip']:v==='strategy_run'?['ai','strategy_result','signal_view']:v==='ai'?['login','token','ai','chip']:['login','token','chip'];$('#as-association').value=['token_visit','strategy_run'].includes(v)?v:'user';renderSteps();markDirty()};$('#as-save').onclick=()=>{const next=config();try{saveConfig(localStorage,next);saved=next;$('#as-saved').textContent='配置已保存，可在刷新后载入';$('#as-restore').hidden=false}catch{$('#as-saved').textContent='保存失败，浏览器存储不可用'}};$('#as-restore').onclick=()=>{if(!saved)return;mode=saved.mode;steps=[...saved.steps];$$('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));$('#as-title').textContent=pageTitle();$('#as-sub').textContent=pageSub();renderSteps();$('#as-range').value=saved.period||saved.range;$('#as-window').value=saved.hours;$('#as-association').value=saved.association||'user';$('#as-source').value=saved.source;$('#as-strategy').value=saved.strategy;if(mode==='retention'){$('#as-initial').value=saved.initial;$('#as-return').value=saved.returning}if(mode==='paths'){$('#as-path-start').value=saved.pathStart||'all';$('#as-path-depth').value=saved.pathDepth||5}run();$('#as-saved').textContent='已载入保存的配置'};$('#as-range').querySelectorAll('option').forEach(o=>{const end=Math.floor((asof+7*3600000)/day)*day-7*3600000;o.textContent=date(end-(+o.value)*day)+'–'+date(end-day)+' · '+o.value+' 天'});try{saved=loadConfig(localStorage)}catch{}$('#as-restore').hidden=!saved;renderSteps();run();
})();
