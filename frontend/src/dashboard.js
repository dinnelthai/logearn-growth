import {createConversionPage} from './pages/conversionScenes.js';
import {reportPeriod,localReportTime,inheritedReportPeriod,rememberReportPeriod} from './analytics/reportPeriod.js';
import {createOperationTaskDetail} from './pages/operationTaskDetail.js';
import {createOperationsComparison} from './pages/operationsComparison.js';
import {createWorkbench} from './pages/workbench.js';
import {createUserProfile} from './pages/userProfile.js';
import {renewedAudience,selectedTagAudience} from './analytics/audienceSelection.js';
import {tagAudience} from './api/userTags.js';
import {mountTagAudience} from './pages/tagAudience.js';
import {createKolCrm} from './pages/kolCrm.js';
import {mountSectionNavigation} from './navigation.js';
import {createMyMonitor} from './pages/myMonitor.js';
import {createActivityMonitor} from './pages/activityMonitor.js'
import {createHomeMonitor} from './pages/homeMonitor.js';
import {TASKS,createTask,taskConfig,savedTaskRecord} from './analytics/analysisTasks.js';
import {drawAnalysisTasks} from './pages/analysisTasks.js';
import {materializeAudience} from './api/drill.js';
import {fetchBackendMeta} from './api/backendAnalytics.js';
import {createCohort} from './analytics/cohortClient.js';
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
let audience=null,task=null,navigationGeneration=0;
const TASK_RECORDS_KEY='logearn.analysis.tasks.v1';
function taskRecords(){try{const a=JSON.parse(localStorage.getItem(TASK_RECORDS_KEY)||'[]');return Array.isArray(a)?a.filter(r=>r&&typeof r.title==='string'&&Number.isFinite(r.asOf)):[]}catch{return []}}
function saveTaskRecord(){if(!task)return;const next=[savedTaskRecord(task,audience),...taskRecords().filter(r=>r.id!==task.id)].slice(0,20);localStorage.setItem(TASK_RECORDS_KEY,JSON.stringify(next))}
async function startTask(id){const generation=navigationGeneration,template=TASKS.find(t=>t.id===id),meta=await fetchBackendMeta();if(generation!==navigationGeneration)return;if(task&&(task.note.trim()||task.completed.length))saveTaskRecord();task=createTask(template,meta);audience=null;pages.segments.configureTask?.(template.filters||{});steps=['logged_in_visit','token','chip'];navigate(template.seed)}
function endTask(){if(task&&(task.note.trim()||task.completed.length))saveTaskRecord();task=null;audience=null;pages.segments.configureTask?.();navigate('tasks')}
function drawTasks(){clearNative();drawAnalysisTasks({host:$('#as-output'),esc,fmt,table,task,audience,records:taskRecords(),start:startTask,go:navigate,save:saveTaskRecord,end:endTask})}
function renderTaskBar(){let host=$('#as-task-bar');if(!host){host=document.createElement('section');host.id='as-task-bar';host.className='a-card task-bar';$('#as-data-status').insertAdjacentElement('afterend',host)}host.hidden=!task;if(!task)return;const t=TASKS.find(t=>t.id===task.template);host.innerHTML=`<strong>${esc(task.title)}</strong><p class="a-muted">固定快照截至 ${clock(task.asOf)} · UTC+7 · ${audience?'已圈选 '+fmt(audience.ids.length)+' 位用户':'尚未圈选：从人数名单继续分析'}${AUDIENCE_MODES.has(mode)?'':' · 当前页面为平台基准/任务记录'}</p><div class="a-audience-actions">${t.steps.map(([m,l])=>`<button class="a-button" data-task-go="${m}" aria-pressed="${m===mode}">${task.completed.includes(m)?'✓ ':''}${esc(l)}</button>`).join('')}<button class="a-button" data-task-done ${AUDIENCE_MODES.has(mode)?'':'disabled'}>标记本模块已核对</button><button class="a-button" data-task-home>任务与结论</button><button class="a-button" data-task-end>结束任务</button></div>`;host.querySelectorAll('[data-task-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.taskGo));host.querySelector('[data-task-home]').onclick=()=>navigate('tasks');host.querySelector('[data-task-end]').onclick=endTask;host.querySelector('[data-task-done]').onclick=()=>{if(!task.completed.includes(mode))task.completed.push(mode);renderTaskBar()}}
let cohortManager=null;
const drawer=createDrawer($('#as-drill'),{getContext:()=>current??config(),onUserProfile:(id,c)=>userProfile.open(id,c),onAnalyze:selection=>{audience=createAudience(selection);navigate(selection.mode);},onAnalyzeRemote:async selection=>{const generation=navigationGeneration,a=await materializeAudience({...selection.selection,q:selection.query});if(generation!==navigationGeneration)throw new Error('页面已切换，请重新选择用户');if(selection.mode==='save'){await createCohort({name:((task?task.title+' · ':'')+selection.title).slice(0,80),description:'分析快照名单 · '+a.count+'人 · '+a.as_of,user_ids:a.ids.map(id=>id.replace(/^user:/,''))});await cohortManager?.refresh();return}audience={...a,title:selection.title,description:selection.description,query:selection.query};if(task){task.snapshotId=a.snapshot_id;task.start=a.start;task.end=a.end;task.asOf=Date.parse(a.as_of)}navigate(selection.mode);}});const closeDrill=()=>drawer.close();
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
const channelsAvailable=isAgg||Array.isArray(dataStore.channelRules);
const referralAvailable=isAgg||Array.isArray(dataStore.referrals)||(dataStore.users||[]).some(u=>u.events.some(e=>['share_click','share_complete','invite_visit'].includes(e.type)));
$('[data-mode="channels"]').hidden=!channelsAvailable&&!referralAvailable;

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
if(dataStore.meta.storage==='hologres'&&!dataStore.meta.capabilities.includes('channels')){const b=$('[data-mode="channels"]');b.textContent='获客';b.title='渠道归因指标尚未接入远程数据'}
$('#as-data-status').textContent=dataStore.meta.storage==='hologres'
  ?'Hologres 数据 · 手动刷新：已接入北极星、漏斗、留存、分群、推荐、行为路径、渠道分析、交易监控及分页下钻。'
  :dataStore.meta.source==='backend-agg'
  ?`服务端聚合模式：浏览器不加载明细事件。北极星 / 渠道 / 交易 / 漏斗 / 留存 / 分群 / 推荐 / 行为路径 / 人群对比走 /api/metrics；下钻走 /api/drill。对比留存/趋势视图仍待补齐。`
  :dataStore.meta.source==='backend'
  ?`数据来自本地 SQLite（/api/analytics），共 ${Number(eventCount).toLocaleString('en-US')} 条已归一化事件；未提供的数据模块不展示。`
  :'所有展示指标仅由已加载的事实数据计算；未提供的数据模块不展示。';
if(!dataStore.meta.historyComplete)$('#as-data-status').textContent+=' 历史覆盖未确认：缺少历史首次事实的用户按首次观测行为判断，首次用户、留存和生命周期结果可能不完整。';
if(dataStore.availability && Object.values(dataStore.availability).includes('error'))$('#as-data-status').textContent+=' 部分接口请求失败，对应指标暂不可用。';
if(!isAgg)renderInputQuality({root,quality:dataStore.inputQuality});
$('#as-data-time').textContent='观测截至 '+new Date(dataStore.meta.asOf+7*3600000).toISOString().slice(0,16).replace('T',' ')+' · UTC+7';
const names=DATA_CONTRACT.eventTypes,day=86400000,base=dataStore.meta.startAt,allUsers=dataStore.users||[];
let asof=dataStore.meta.asOf;
const usersById=new Map(allUsers.map(u=>[u.id,u]));
let users=allUsers;
globalThis.LogEarnAnalyticsData={contract:DATA_CONTRACT,snapshot:dataStore,isMock:dataStore.meta.source==='mock',isAgg};
const fmt=n=>n.toLocaleString('en-US'),pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'—',date=t=>new Date(t+7*3600000).toISOString().slice(5,10).replace('-','/'),clock=t=>new Date(t+7*3600000).toISOString().slice(5,16).replace('T',' '),daynum=t=>Math.floor((t-base)/day), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(heads,rows)=>`<div class="a-scroll"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const stat=(l,v,s)=>`<div class="a-stat"><div class="a-muted">${l}</div><div class="a-statvalue">${v}</div><div class="a-muted">${s}</div></div>`;
$('#as-source').innerHTML='<option value="all">全部来源</option>'+[...new Set([...users.flatMap(u=>[u.source,...u.events.map(e=>e.entry_source)].filter(Boolean)),...(dataStore.meta.sources??[])])].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
$('#as-strategy').innerHTML='<option value="all">全部策略</option>'+[...new Set([...users.flatMap(u=>u.events.map(e=>e.strategy).filter(Boolean)),...(dataStore.meta.strategies??[])])].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
let mode='home',steps=['login','token','ai','chip'],dirty=false,saved=null,current=null;
const sectionNavigation=mountSectionNavigation(root,navigate);
const tagAnalysis=mountTagAudience(root,{esc,config:()=>({...config(),...(mode==='segments'?pages.segments.getPeriod?.():{})}),getAudience:()=>audience,apply:a=>applyAudience(a),clear:()=>applyAudience(null)});
function applyAudience(a,nextMode=mode){audience=a;pages.segments.configureAudience?.(a);navigate(nextMode)}
async function analyzeTag(id,period,nextMode){const generation=navigationGeneration,meta=await fetchBackendMeta();if(generation!==navigationGeneration)return;try{const value=await tagAudience({tag_ids:[id],tag_mode:'all',start:period.start,end:period.end,snapshot_id:meta.snapshot_id,source:'all'});if(generation===navigationGeneration)applyAudience(selectedTagAudience(value,null,[id],'all'),nextMode)}catch(e){$('#as-data-status').textContent=e.message}}
function config(){const period=$('#as-range').value,legacyEnd=Math.floor((asof+7*3600000)/day)*day-7*3600000+(['login-conversion','invite-conversion','north','funnel','retention','paths','trade-monitor','channels'].includes(mode)?day:0),legacyStart=period==='all'?Math.floor((base+7*3600000)/day)*day-7*3600000:legacyEnd-Number(period)*day,p=period==='custom'&&!audience&&!task?reportPeriod({days:'custom',start:$('#as-custom-range [data-global-start]').value,end:$('#as-custom-range [data-global-end]').value}):dataStore.meta.storage==='hologres'&&!audience&&!task&&period!=='all'?reportPeriod({...inheritedReportPeriod({days:Number(period)}),days:period==='custom'?'custom':Number(period),asOf:asof}):{start:legacyStart,end:legacyEnd},start=p.start,end=p.end,range=Math.ceil((end-start)/day);return taskConfig(audiencePeriod({mode,association:mode==='funnel'?'user':$('#as-association').value,steps:[...steps],range,period,hours:mode==='funnel'?24:+$('#as-window').value,source:['north','funnel'].includes(mode)?'all':$('#as-source').value,strategy:mode==='funnel'?'all':$('#as-strategy').value,start,end,initial:$('#as-initial')?.value||'chip',returning:$('#as-return')?.value||'chip',pathStart:$('#as-path-start')?.value||'all',pathStop:$('#as-path-stop')?.value||'none',pathDepth:+($('#as-path-depth')?.value||5),audienceIds:audience?.ids? [...audience.ids]:null,cohortId:audience?.cohortId||null},audience),AUDIENCE_MODES.has(mode)?task:null,audience)}
async function renewAnalysisSnapshot(){
 const original=audience,generation=navigationGeneration
 const meta=await fetchBackendMeta({refresh:true})
 if(generation!==navigationGeneration||audience!==original)return
 if(audience)audience=renewedAudience(original,meta)
 await globalThis.__refreshRemoteAnalytics(meta);renderAudience()
}
function renderAudience(){
 let host=$('#as-audience');
 if(!host){host=document.createElement('div');host.id='as-audience';host.className='a-audience';$('#as-data-status').insertAdjacentElement('afterend',host)}
 host.hidden=!audience;
 $('#as-save').disabled=!!audience;$('#as-restore').disabled=!!audience;
 if(!audience)return;
 const applied=AUDIENCE_MODES.has(mode);
 host.innerHTML=`<div><strong>${applied?'当前分析人群':'已保留分析人群'}：${esc(audience.title)} · ${audience.ids.length} 人</strong><p>${esc(audience.description)}${audience.query?' · 搜索：'+esc(audience.query):''}${audience.fixed_at?' · 名单固定于 '+clock(Date.parse(audience.fixed_at)):''}${audience.as_of?' · 数据截至 '+clock(Date.parse(audience.as_of)):''} · ${date(audience.start)}–${date(audience.end-1)}${applied?' · 用户名单固定，可在此人群内继续筛选':' · 当前页面展示全平台'}</p>${mode==='retention'?'<p>留存描述所选用户的回访情况，分母为其中符合首次行为入组条件的用户。</p>':''}</div><div class="a-audience-actions"><button class="a-button" data-audience-go="funnel">漏斗</button><button class="a-button" data-audience-go="paths">行为路径</button><button class="a-button" data-audience-go="retention">留存</button><button class="a-button" data-audience-go="segments">用户分群 / 积分</button><button class="a-button" data-audience-go="trade-monitor">交易问题</button><button class="a-button" data-audience-go="referral">推荐贡献</button><button class="a-button" data-audience-renew ${task?'disabled':''}>保留名单，更新数据</button><button class="a-button" data-audience-clear>清除人群</button></div>`;
 host.querySelectorAll('[data-audience-go]').forEach(b=>{b.hidden=!!task;b.onclick=()=>navigate(b.dataset.audienceGo)});
 host.querySelector('[data-audience-clear]').onclick=()=>{users=allUsers;applyAudience(null)};
 host.querySelector('[data-audience-renew]').onclick=async e=>{
  const button=e.target,original=audience,generation=navigationGeneration;button.disabled=true;button.textContent='正在更新数据…'
  try{const meta=await fetchBackendMeta({refresh:true});if(generation!==navigationGeneration||audience!==original)return;audience=renewedAudience(original,meta);await globalThis.__refreshRemoteAnalytics(meta);renderAudience()}
  catch(error){if(generation===navigationGeneration)$('#as-data-status').textContent='更新失败，保留原名单和结果：'+error.message}
  finally{if(button.isConnected){button.disabled=false;button.textContent='保留名单，更新数据'}}
 };
}
function mountCohorts(){
 const host=$('#as-cohort-mount');if(!host)return;
 if(cohortManager){cohortManager.dispose();cohortManager=null}
 cohortManager=mountCohortManager(host,{
  allUsers,asof,day,esc,remote:dataStore.meta.storage==='hologres',
  onApply(aud){applyAudience(aud,'segments')}
 })
}
function markDirty(){dirty=true;$('#as-run').textContent='应用修改';$('#as-stale').hidden=false;$('#as-dirty').textContent='配置已修改，点击运行更新结果';$('#as-saved').textContent=''}
function northDefinition(){if(mode!=='north')return;const c=config(),label=c.period==='all'?'全周期（已加载数据）':'最近'+c.range+'天';$('#as-stepcount').textContent=label;$('#as-steps').innerHTML=`<p><strong>有效分析用户</strong></p><p class="a-muted">${date(c.start)}–${date(c.end-day)}，至少成功查看或下钻一次筹码峰的用户。</p><p class="a-muted">周期人数按用户去重；每日人数按天去重，包含首次分析和回访分析。</p><p class="a-muted">日均 = 每日有效分析人数之和 ÷ ${c.range} 个业务日。按 UTC+7 统计，包含数据截至日的已观测人数；当日未结束时为进行中。</p>${c.period==='all'?'<p class="a-muted">全周期仅覆盖当前已加载的数据历史。</p>':''}`;}
function renderCustomRange(){const range=$('#as-range');range.closest('label').hidden=mode==='funnel'&&!audience&&!task;let node=$('#as-custom-range');if(!node){node=document.createElement('div');node.id='as-custom-range';$('#as-range').closest('label').after(node)}let p=inheritedReportPeriod();if(range.value==='custom'&&(p.days!=='custom'||!p.start||!p.end)){const bounds=reportPeriod({...p,days:p.days==='custom'?14:Number(p.days)||14,asOf:asof});p={days:'custom',start:localReportTime(bounds.start),end:localReportTime(bounds.end)};rememberReportPeriod(p)}node.hidden=$('#as-range').value!=='custom'||!!audience||!!task;node.innerHTML=`<label>开始 · UTC+7<input type="datetime-local" data-global-start value="${esc(p.start||'')}"></label><label>截止（不含）· UTC+7<input type="datetime-local" data-global-end value="${esc(p.end||'')}"></label>`;for(const key of ['start','end'])node.querySelector('[data-global-'+key+']').onchange=e=>{rememberReportPeriod({...inheritedReportPeriod(),days:'custom',[key]:e.target.value});markDirty()}}
function rangeOptions(){$('#as-range').closest('label').hidden=false;if(task&&AUDIENCE_MODES.has(mode)){if($('#as-custom-range'))$('#as-custom-range').hidden=true;$('#as-range').innerHTML=`<option value="task">任务统计期 · ${date(task.start)}–${date(task.end-1)}</option>`;return}if(audience&&AUDIENCE_MODES.has(mode)){if($('#as-custom-range'))$('#as-custom-range').hidden=true;const select=$('#as-range');select.innerHTML=`<option value="audience">人群原统计期 · ${date(audience.start)}–${date(audience.end-1)}</option>`;return}const select=$('#as-range'),old=select.value,end=Math.floor((asof+7*3600000)/day)*day-7*3600000+(['login-conversion','invite-conversion','north','funnel','retention','paths','trade-monitor','channels'].includes(mode)?day:0);select.innerHTML=(mode==='north'?['all','1','7','14','28','30','90','custom']:mode==='funnel'?['1','7','14','28','90','custom']:['login-conversion','invite-conversion'].includes(mode)?['1','7','14','28','custom']:mode==='paths'?['1','3','7']:['trade-monitor','channels'].includes(mode)?['1','7','14','28','30','90','custom']:['7','14','28','90','custom']).map(v=>`<option value="${v}">${v==='custom'?'自定义时间':v==='all'?'全周期':'最近'+v+'天'}${v==='custom'?'':' · '+date(v==='all'?Math.floor((base+7*3600000)/day)*day-7*3600000:end-Number(v)*day)+'–'+date(end-day)}</option>`).join('');const inherited=inheritedReportPeriod({days:old}),preferred=String(inherited.days);select.value=[...select.options].some(o=>o.value===preferred)?preferred:[...select.options].some(o=>o.value===old)?old:mode==='paths'?'7':'14';if(mode==='funnel')select.value='custom';renderCustomRange();}
function availableFunnelNames(){return Object.entries(names).filter(([key])=>!Array.isArray(dataStore.meta.funnelSteps)||dataStore.meta.funnelSteps.includes(key))}
function limitFunnelSteps(){
 if(!Array.isArray(dataStore.meta.funnelSteps))return;
 const valid=new Set(dataStore.meta.funnelSteps);
 steps=steps.filter(s=>valid.has(s));
 if(steps.length<2)steps=['logged_in_visit','token','chip'].filter(s=>valid.has(s));
 const presets=[['visit_login','每日访问 → 已登录访问',['daily_visit','logged_in_visit']],['ai','AI 激活 · 四步',['login','token','ai','chip']],['overall','整体激活 · 三步',['login','token','chip']],['logged_in','已登录访问 · 三步',['logged_in_visit','token','chip']],['token_visit','同次 Token · 点击→详情→分析',['token_click','token','chip']],['strategy_run','同次策略 · 启动→结果→查看',['ai','strategy_result','signal_view']],['custom','自定义步骤',[]]];
 $('#as-preset').innerHTML=presets.filter(([, ,ss])=>ss.every(s=>valid.has(s))).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
}
function renderConversionSceneControls(){
 const scene=mode==='login-conversion'?'登录':'邀请';tagAnalysis.draw(mode)
 for(const cls of ['a-home-page','a-crm-page','a-task-page','a-activity-page','a-north-page'])root.classList.remove(cls)
 $('.a-config').hidden=false;$('#as-save').hidden=true;$('#as-restore').hidden=true;const nt=$('#as-north-toolbar');if(nt)nt.hidden=true
 rangeOptions();$('#as-range').disabled=!!((task||audience)&&AUDIENCE_MODES.has(mode));$('#as-range-note').hidden=true;$('#as-source').closest('label').hidden=false;$('#as-source').disabled=!!audience;$('#as-source').innerHTML='<option value="all">全部来源</option>'+(dataStore.meta.sources||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$('#as-source-caption').textContent='首次已记录来源'
 $('#as-config-title').textContent=scene+'场景';$('#as-stepcount').textContent=scene==='登录'?'按尝试':'按邀请流程';$('#as-add').hidden=true;$('#as-presets').hidden=true;$('#as-association-label').hidden=true;$('#as-window-label').hidden=scene==='登录';$('#as-strategy-label').hidden=true;$('#as-strategy-note').hidden=true
 $('#as-steps').innerHTML=scene==='登录'?'<p>入口点击与登录尝试分别统计；主动登录、自动恢复及历史未知类型分开。</p><p class="a-muted">阶段只使用明确的开始和结果事件，不用失败阶段猜测各步到达人数。</p>':'<p>历史入口 → 登录身份 → 数据库关系 → 绑定后分析；显式校验流程独立展示。</p><p class="a-muted">关系匹配需身份、邀请码和绑定时间证据；多个候选入口或换绑单列待核实。</p>'
 $('.a-footer>span').textContent='真实流程与尝试 · 名单按用户去重 · 业务日 UTC+7'
}
function renderSteps(){if($('#as-range-caption'))$('#as-range-caption').textContent=mode==='retention'?'入组日期':'统计日期';const coverage=$('#as-coverage');if(coverage)coverage.hidden=['home','my-monitor','workbench','crm','activities','operations-compare'].includes(mode);const conversionNav=$('#as-conversion-nav');conversionNav.hidden=!['funnel','login-conversion','invite-conversion'].includes(mode);conversionNav.querySelectorAll('[data-conversion-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.conversionView===mode)));const acq=$('#as-acquisition-nav');acq.hidden=!['channels','referral'].includes(mode);acq.querySelectorAll('[data-acquisition-view]').forEach(b=>{b.setAttribute('aria-pressed',String(mode===b.dataset.acquisitionView));b.hidden=b.dataset.acquisitionView==='channels'?!channelsAvailable:!referralAvailable});if(['login-conversion','invite-conversion'].includes(mode)){renderConversionSceneControls();return}tagAnalysis.draw(mode);root.classList.toggle('a-crm-page',mode==='crm');root.classList.toggle('a-task-page',mode==='tasks');root.classList.toggle('a-home-page',['home','my-monitor'].includes(mode));root.classList.toggle('a-activity-page',mode==='activities');if(mode==='activities'||mode==='crm'||mode==='workbench'||mode==='operations-compare'){$('.a-footer>span').textContent=mode==='operations-compare'?'统一统计期 · 重叠用户去重 · 业务日 UTC+7':mode==='workbench'?'运营待办 · 跟进与结算 · 业务日 UTC+7':mode==='crm'?'KOL 档案与跟进 · 分析事件为观测口径 · 业务日 UTC+7':'活动计划与固定批次 · 已观测使用与交易 · 业务日 UTC+7';root.classList.remove('a-home-page');root.classList.add('a-north-page');$('.a-config').hidden=true;$('#as-save').hidden=true;$('#as-restore').hidden=true;const nt=$('#as-north-toolbar');if(nt)nt.hidden=true;return}$('#as-restore').hidden=!saved;root.classList.toggle('a-home-page',['home','my-monitor'].includes(mode));if(['home','my-monitor'].includes(mode)){$('.a-footer>span').textContent='全平台指标 · 按各项业务口径统计 · 业务日 UTC+7';root.classList.add('a-north-page');$('.a-config').hidden=true;$('#as-save').hidden=true;const nt=$('#as-north-toolbar');if(nt)nt.hidden=true;return}root.classList.toggle('a-task-page',mode==='tasks');$('#as-source').disabled=!!audience&&AUDIENCE_MODES.has(mode);$('.a-config').hidden=mode==='tasks';if(mode==='tasks'){root.classList.remove('a-north-page');const nt=$('#as-north-toolbar');if(nt)nt.hidden=true;$('#as-save').hidden=true;return}$('#as-save').hidden=false;$('.a-footer>span').textContent=mode==='paths'?'流向按会话计数 · 名单按用户去重 · 业务日 UTC+7':mode==='trade-monitor'?'提交批次与订单分开统计 · 手动刷新 · 业务日 UTC+7':'按用户去重 · 业务日 UTC+7';if(mode==='funnel')limitFunnelSteps();root.classList.toggle('a-north-page',mode==='north');const toolbar=$('#as-north-toolbar');if(toolbar)toolbar.hidden=mode!=='north';rangeOptions();$('#as-source').closest('label').hidden=['north','funnel'].includes(mode);if(mode!=='channels'||dataStore.meta.storage==='hologres')$('#as-source').innerHTML='<option value="all">全部来源</option>'+[...new Set([...users.flatMap(u=>[u.source,...u.events.map(e=>e.entry_source)].filter(Boolean)),...(dataStore.meta.sources??[])])].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''); $('#as-range').closest('label').hidden=['segments','referral'].includes(mode)&&dataStore.meta.storage==='hologres';$('#as-range').disabled=mode==='segments'||!!((task||audience)&&AUDIENCE_MODES.has(mode));$('#as-range-note').hidden=mode!=='segments'||dataStore.meta.storage==='hologres';if(['segments','referral'].includes(mode)&&dataStore.meta.storage==='hologres')$('#as-range-note').textContent='右侧可选择统计期；主分群按最新观测计算。'; $('#as-source-caption').textContent=mode==='funnel'?'首次获客来源':mode==='referral'?'推荐用户首次来源':'首次获客来源'; $('#as-config-title').textContent=mode==='funnel'?'漏斗步骤':'留存行为';$('#as-stepcount').textContent=mode==='funnel'?steps.length+' 步':'D1–D7';$('#as-add').hidden=mode!=='funnel';$('#as-presets').hidden=mode!=='funnel';$('#as-association-label').hidden=true;if(mode==='funnel')$('#as-preset').value=JSON.stringify(steps)===JSON.stringify(['daily_visit','logged_in_visit'])?'visit_login':JSON.stringify(steps)===JSON.stringify(['logged_in_visit','token','chip'])?'logged_in':JSON.stringify(steps)===JSON.stringify(['token_click','token','chip'])?'token_visit':JSON.stringify(steps)===JSON.stringify(['ai','strategy_result','signal_view'])?'strategy_run':JSON.stringify(steps)===JSON.stringify(['login','token','ai','chip'])?'ai':JSON.stringify(steps)===JSON.stringify(['login','token','chip'])?'overall':'custom';$('#as-add').disabled=steps.length>=5;$('#as-window-label').hidden=true;$('#as-strategy-label').hidden=true;$('#as-strategy-note').hidden=true;if(mode==='channels'&&dataStore.meta.storage==='hologres'){$('#as-config-title').textContent='来源归因口径';$('#as-stepcount').textContent='真实来源';$('#as-source-caption').textContent='首次已记录来源';$('#as-source').insertAdjacentHTML('beforeend','<option value="未知">未知来源</option>');$('#as-steps').innerHTML='<p><strong>首次已记录来源</strong></p><p class="a-muted">按线上来源字段最早非空记录归组，未知来源单列。</p><p class="a-muted">右侧切换本期活跃或本期首次观测用户；首次观测不等于新增获客。各行为独立统计，不是顺序漏斗。</p>';return}if(mode==='channels'){$('#as-source').innerHTML='<option value="all">全部渠道</option>'+(dataStore.channelRules??[]).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');$('#as-config-title').textContent='渠道归因口径';$('#as-stepcount').textContent='首次来源';$('#as-source-caption').textContent='查看指定渠道';$('#as-steps').innerHTML=`<p><strong>首次来源</strong></p><p class="a-muted">用户首次到访时绑定渠道，后续访问不覆盖，用于比较获客质量。</p><p><strong>最近来源</strong></p><p class="a-muted">记录用户本次访问来源，用于活动短期效果分析。</p><p class="a-muted">当前按首次获客来源统计；来源参数未匹配规则时归入未知渠道。</p>`;return}if(mode==='segments'){$('#as-config-title').textContent='分群规则';$('#as-stepcount').textContent='行为成熟度';$('#as-source-caption').textContent='用户首次来源';$('#as-steps').innerHTML=`${dataStore.meta.storage==='hologres'?'<p class="a-muted">右侧提供注册账号筛选与对比；未观测分析不等于从未使用。历史覆盖未确认时，不确认流失或回流。</p>':''}<p><strong>按观测截至时间分群</strong></p><p class="a-muted">优先级：回流 → 已流失 → 流失风险 → 高频核心 → 策略型 → 新激活 → 分析型 → 未激活。</p><p class="a-muted">近28天分析≥6天为高频核心；使用≥2种不同AI策略为策略型；最近7天无分析为流失风险，最近28天无分析为已流失。</p><p class="a-muted">回流需存在至少28天的分析间隔，且回归发生在近28天。</p><div id="as-cohort-mount" style="margin-top:16px;border-top:1px solid var(--a-border);padding-top:14px"></div>`;if(dataStore.meta.storage==='hologres')$('#as-steps').innerHTML=`<p><strong>注册用户与行为表现</strong></p><p class="a-muted">默认关注有业务信号的用户；右侧可切换全部注册、仅可联系或无已知信号用户池，分母随用户池变化。未匹配身份单列。</p><p class="a-muted">近28天分析≥6天为高频核心；近28天实际启动≥2种策略为策略型。最近7天内首次观测分析为新分析用户。</p><p class="a-muted">未观测分析不代表从未使用；缺完整历史时，流失和回流显示观察不足。</p><div id="as-cohort-mount" style="margin-top:16px;border-top:1px solid var(--a-border);padding-top:14px"></div>`;mountCohorts();return}if(mode==='referral'&&dataStore.meta.storage==='hologres'){$('#as-config-title').textContent='推荐增长口径';$('#as-stepcount').textContent='一级关系';$('#as-source-caption').textContent='被邀请者首次来源';$('#as-steps').innerHTML='<p><strong>有效用户推荐</strong></p><p class="a-muted">推荐双方匹配注册账号，排除自邀、ID=0、身份异常和循环关系。二三级不重复计入直接推荐。</p><p><strong>用户传播</strong></p><p class="a-muted">全体用户参与率、被邀请后继续推荐率、下一代产出；未推荐用户保留在分母。</p><p class="a-muted">右侧选择绑定批次和传播观察窗。新增绑定不等于新获客，当前关系不证明历史归因。</p>';return}if(mode==='referral'){$('#as-config-title').textContent='增长循环口径';$('#as-stepcount').textContent='按推荐关系去重';$('#as-source-caption').textContent='推荐用户首次来源';$('#as-steps').innerHTML=`<p>有效推荐系数 K</p><p class="a-muted">每位参与推荐用户带来的新有效分析用户数。</p><p class="a-muted">按推荐关系绑定时间入组，绑定后7天内完成有效分析为激活。</p>`;return}if(mode==='north'){$('#as-config-title').textContent='指标定义';northDefinition();return}if(mode==='trade-monitor'){$('#as-config-title').textContent='监控口径';$('#as-stepcount').textContent='批次 / 订单';$('#as-source-caption').textContent='用户首次来源';$('#as-steps').innerHTML=`<p><strong>成功率 = 成功订单 / 已关联终态订单</strong></p><p class="a-muted">提交按尝试ID去重；订单按用户、链、订单ID去重。一批提交可能对应多个钱包订单；待确认与冲突单列。</p><p class="a-muted">失败原因取已观测业务终态，不把待确认当失败。</p>`;return}if(mode==='paths'){$('#as-config-title').textContent='路径设置';$('#as-stepcount').textContent='按会话统计';$('#as-source-caption').textContent='用户首次来源';$('#as-steps').innerHTML=`<label>路径起点<select id="as-path-start"><option value="all">会话首次行为</option>${Object.entries(names).filter(([k])=>!['strategy_heartbeat','daily_visit','logged_in_visit','login_verified'].includes(k)&&(dataStore.meta.storage!=='hologres'||dataStore.meta.funnelSteps?.includes(k))).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label><label>中止动作<select id="as-path-stop"><option value="none">不设置（观测结束）</option><option value="chip">有效分析（筹码峰，含下钻）</option></select></label><label>最多展示行为步数<select id="as-path-depth"><option value="3">3 步</option><option value="5" selected>5 步</option><option value="7">7 步</option></select></label><p class="a-muted">展示实际发生的行为，不要求完成固定漏斗。连续 Token 浏览合并；到达中止动作后停止展示。</p>`;$('#as-path-stop').onchange=markDirty;$('#as-path-start').onchange=markDirty;$('#as-path-depth').onchange=markDirty;return}if(mode==='retention'){$('#as-steps').innerHTML=`<label>首次行为<select id="as-initial">${Object.entries(names).map(([k,n])=>`<option value="${k}" ${k==='chip'?'selected':''}>${n}</option>`).join('')}</select></label><label>回访行为<select id="as-return">${Object.entries(names).map(([k,n])=>`<option value="${k}" ${k==='chip'?'selected':''}>${n}</option>`).join('')}</select></label><p class="a-muted">以首次行为发生日为 D0</p>`;$('#as-initial').onchange=markDirty;$('#as-return').onchange=markDirty;return}
$('#as-steps').innerHTML=steps.map((s,i)=>`<div class="a-step"><div class="a-stephead"><span class="a-number">步骤 ${i+1}</span><div><button class="a-iconbtn cursor-interaction" data-up="${i}" aria-label="上移步骤 ${i+1}" ${i===0?'disabled':''}>↑</button><button class="a-iconbtn cursor-interaction" data-down="${i}" aria-label="下移步骤 ${i+1}" ${i===steps.length-1?'disabled':''}>↓</button><button class="a-iconbtn cursor-interaction" data-del="${i}" aria-label="删除步骤 ${i+1}" ${steps.length<=2?'disabled':''}>×</button></div></div><select data-event="${i}" aria-label="步骤 ${i+1} 事件">${availableFunnelNames().map(([k,n])=>`<option value="${k}" ${k===s?'selected':''}>${n}</option>`).join('')}</select></div>`).join('');$$('[data-event]').forEach(el=>el.onchange=()=>{steps[+el.dataset.event]=el.value;$('#as-preset').value='custom';markDirty()});$$('[data-up]').forEach(el=>el.onclick=()=>{let i=+el.dataset.up;[steps[i-1],steps[i]]=[steps[i],steps[i-1]];renderSteps();markDirty()});$$('[data-down]').forEach(el=>el.onclick=()=>{let i=+el.dataset.down;[steps[i+1],steps[i]]=[steps[i],steps[i+1]];renderSteps();markDirty()});$$('[data-del]').forEach(el=>el.onclick=()=>{steps.splice(+el.dataset.del,1);renderSteps();markDirty()});}
function userTimeline(id,host){const u=usersById.get(id);if(!u)return;host.innerHTML=`<h2>${esc(u.id)} · 事件时间线</h2><div class="a-timeline">${u.events.map(e=>`<div class="a-event"><strong>${esc(names[e.type]||e.type)}</strong><div>${clock(e.t)}</div>${e.strategy?`<span class="a-muted">${esc(e.strategy)}</span>`:''}</div>`).join('')}</div>`}
function userButton(u){return `<button class="a-tablelink cursor-interaction" data-user="${esc(u.id)}">${esc(u.id)}</button>`}
function drill(title,rows,desc,context){drawer.open({title,context,description:desc,rows,columns:['用户','来源（当前分析口径）','首次事件','事件记录'],renderRow:r=>{const u=r.u||r;return[userButton(u),esc(r.displaySource||u.source),u.events[0]?clock(u.events[0].t):'—',u.events.length+' 条']},onUser:userTimeline,note:'点击用户ID查看事件时间线。'})}

const themeMedia=matchMedia('(prefers-color-scheme: dark)');
function clearNative(){Object.values(pages).forEach(page=>page.dispose());if(channelChartsCleanup){channelChartsCleanup();channelChartsCleanup=null}if(channelCleanup){channelCleanup();channelCleanup=null}}
function drawFunnel(c){return pages.funnel.draw(c)}
function drawRetention(c){return pages.retention.draw(c)}

const coverage=dataStore.meta.coverage??{};
const covered=(source,start,end)=>periodCoverage(coverage[source],start,end)==='complete';
function renderCoverage(c){if(['login-conversion','invite-conversion'].includes(mode)){let host=$('#as-coverage');if(!host){host=document.createElement('div');host.id='as-coverage';host.className='a-status';$('#as-data-status').after(host)}host.hidden=false;host.textContent='转化按明确流程与尝试关联 · 未观测不等于未使用 · 邀请绑定以业务事实核验，缺事件不补造转化';return}if(['paths','trade-monitor','channels'].includes(mode)&&dataStore.meta.storage==='hologres'){let host=$('#as-coverage');if(!host){host=document.createElement('div');host.id='as-coverage';host.className='a-status';$('#as-data-status').after(host)}host.textContent=mode==='paths'?'路径按用户与会话关联；历史覆盖未确认，观测结束不等于流失。':mode==='channels'?'按首次已记录来源归组 · 首次观测不是确认新增获客；行为与归因覆盖未确认。':'手动交易埋点 · 批次与订单分开统计；成功率只计已关联终态，待确认与冲突单列。';return}if(mode==='referral'&&dataStore.meta.storage==='hologres'){let host=$('#as-coverage');if(!host){host=document.createElement('div');host.id='as-coverage';host.className='a-status';$('#as-data-status').after(host)}host.textContent='推荐按有效一级关系统计；新增绑定不等于新获客，未匹配身份及异常关系单列。行为历史覆盖未确认。';return}if(mode==='segments'&&dataStore.meta.storage==='hologres'){let host=$('#as-coverage');if(!host){host=document.createElement('div');host.id='as-coverage';host.className='a-status';$('#as-data-status').after(host)}host.textContent='行为历史覆盖未确认：未观测不等于从未使用；留存与流失判断受历史限制。资产与权益覆盖见本页说明。';return}let host=$('#as-coverage');if(!host){host=document.createElement('div');host.id='as-coverage';host.className='a-status';$('#as-data-status').after(host)}const ev=coverageLabel(periodCoverage(coverage.events,c.start,c.end)),tr=coverageLabel(periodCoverage(coverage.trades,c.start,c.end));host.textContent=`所选周期：行为${ev}；交易${Array.isArray(dataStore.trades)?tr:'未提供'}。${covered('events',c.start,c.end)?'':'行为人数为已观测记录，不能据此确认完整零值。'}${Array.isArray(dataStore.trades)&&!covered('trades',c.start,c.end)?'交易金额为已观测金额，未覆盖日期不填零。':''}${dataStore.meta.historyComplete?'':'历史首次/流失判断仍受加载历史限制。'}`}
function drawNorth(c){return pages.north.draw(c)}
function drawReferral(c){return pages.referral.draw(c)}

function drawChannels(c){
if(isAgg)return pages.channelsAgg.draw(c)
clearNative();$('#as-output').innerHTML='';
if(dataStore.channelRules){const report=document.createElement('div');$('#as-output').append(report);channelChartsCleanup=mountChannelAnalytics(report,{rules:dataStore.channelRules??[],users,trades:dataStore.trades,startAt:c.start,endAt:c.end,asOf:asof,channel:c.source,coverage,onDrill:drill});}
if(Array.isArray(dataStore.channelRules)){const details=document.createElement('details');details.className='a-card a-details';details.innerHTML='<summary>渠道管理 · 查看匹配规则</summary>';const manager=document.createElement('div');details.append(manager);$('#as-output').append(details);channelCleanup=mountChannels(manager,{isMock:false,initialRules:dataStore.channelRules,jsonMode:dataStore.meta.source==='json'});}
}

function drawTradeMonitor(c){return pages.tradeMonitor.draw(c)}

function drawSegments(c){return pages.segments.draw(c)}

function drawValueLoop(c){clearNative();$('#as-output').innerHTML='';}

function drawPaths(c){return pages.paths.draw(c)}

function pageTitle(){if(mode==='login-conversion')return '转化 · 登录';if(mode==='invite-conversion')return '转化 · 邀请';if(mode==='operations-compare')return '运营工作台 · 效果对比';if(mode==='workbench')return '运营工作台 · 待办';if(mode==='crm')return '运营工作台 · KOL CRM';if(mode==='my-monitor')return '增长转化';if(mode==='activities')return '运营工作台 · 活动监控';if(mode==='home')return '总览 · 业务概况';if(mode==='tasks')return '分析任务';return mode==='north'?'北极星指标 · 有效分析用户':mode==='channels'?'获客 · 来源质量':mode==='paths'?'行为路径分析':mode==='funnel'?'用户激活漏斗':mode==='retention'?'有效分析留存':mode==='referral'?'获客 · 推荐贡献':mode==='value'?'价值闭环':mode==='trade-monitor'?'交易成功率监控':'用户分群分析'}
function pageSub(){if(mode==='login-conversion')return '区分登录失败、主动取消与未知，定位具体阶段的问题';if(mode==='invite-conversion')return '从邀请到达、校验和登录，到正式关系成立与后续使用';if(mode==='operations-compare')return '统一比较 KOL 与活动的用户、分析使用和交易表现';if(mode==='workbench')return '集中处理KOL跟进、活动预约与结算、用户回访与人群任务';if(mode==='crm')return '记录合作与跟进，追踪本人使用、交易和直接邀请贡献';if(mode==='my-monitor')return '跟踪新访客首次分析、登录转化、免费试用与 D1/D7 回访';if(mode==='activities')return '管理预约与固定批次，跟进激活、持续使用和交易';if(mode==='home')return '集中查看使用、回访与交易质量，及时发现需要处理的问题';if(mode==='tasks')return '围绕业务问题，串联用户、行为、交易与增长';return mode==='north'?'有多少用户真正获得了筹码分析的价值':mode==='channels'?'用户从哪里来，各来源的分析、策略与交易表现如何':mode==='paths'?'用户先做什么、接着去哪，以及在哪里结束观察':mode==='funnel'?'从登录、Token详情、AI策略到有效分析，定位转化损失':mode==='retention'?'从首次使用到持续回访，比较各批次表现':mode==='referral'?'谁带来更多有价值用户，用户推荐是否形成持续增长':mode==='value'?'看完筹码分析后，是否真的发生了交易和价值':mode==='trade-monitor'?'基于线上手动交易记录，查看成功率、待确认和失败原因':'哪些用户的需求与表现不同，谁更容易交易和付费'}
function unsupportedAgg(label){clearNative();$('#as-output').innerHTML=`<div class="a-card a-details"><h2>${esc(label)} · 聚合模式待迁移</h2><p>当前数据量已启用服务端聚合。本页将在后续 Phase 接入 <code>/api/metrics</code>；在此之前不加载明细、也不显示假零。</p><p class="a-muted">已支持：北极星、渠道、交易、漏斗、留存、分群、推荐、行为路径。</p></div>`}
function run(){if(mode==='operations-compare'){current=null;closeDrill();if($('#as-audience'))$('#as-audience').hidden=true;return pages['operations-compare'].draw()}if(mode==='workbench'){current=null;closeDrill();if($('#as-audience'))$('#as-audience').hidden=true;return pages.workbench.draw()}if(mode==='crm'){current=null;closeDrill();if($('#as-audience'))$('#as-audience').hidden=true;return pages.crm.draw()}if(mode==='my-monitor'){current=null;closeDrill();renderTaskBar();if($('#as-audience'))$('#as-audience').hidden=true;if($('#as-coverage'))$('#as-coverage').textContent='全平台增长监控 · UTC+7 · 首次观测口径与采集状态单列';return pages['my-monitor'].draw()}if(mode==='activities'){current=null;closeDrill();if($('#as-audience'))$('#as-audience').hidden=true;return pages.activities.draw()}if(mode==='home'){current=null;closeDrill();if($('#as-audience'))$('#as-audience').hidden=true;if($('#as-coverage'))$('#as-coverage').textContent='平台整体指标 · 按各项业务口径统计 · 采集覆盖未确认';return pages.home.draw()}renderTaskBar();if(task&&!task.visited.includes(mode))task.visited.push(mode);if(mode==='tasks'){renderAudience();closeDrill();if($('#as-coverage'))$('#as-coverage').textContent='任务沿用固定用户范围与快照；各模块行为入组条件不同，人数与订单、会话不能直接相加。';$('.a-footer>span').textContent='固定人群 · 快照与观察窗明确 · 业务日 UTC+7';return drawTasks()}if(dataStore.meta.storage==='hologres'&&!dataStore.meta.capabilities.includes(mode)){clearNative();$('#as-output').innerHTML='<div class="a-card a-details"><h2>此页面正在迁移到远程查询</h2><p>该模块尚未接入真实数据。可使用北极星、漏斗、留存、分群、推荐、行为路径和交易监控。</p></div>';return}users=audienceUsers(allUsers,audience,mode);renderAudience();northDefinition();try{current=config()}catch(e){$('#as-data-status').textContent=e.message;return}renderCoverage(current);dirty=false;$('#as-run').textContent='运行分析';$('#as-stale').hidden=true;$('#as-dirty').textContent='已应用当前配置';closeDrill();if(isAgg&&!['login-conversion','invite-conversion','north','channels','trade-monitor','funnel','retention','segments','referral','paths'].includes(mode)){unsupportedAgg(pageTitle());return}if(!isMock&&!isAgg&&!Array.isArray(dataStore.trades)&&((mode==='funnel'&&current.steps.includes('trade'))||(mode==='retention'&&[current.initial,current.returning].includes('trade')))){clearNative();$('#as-output').innerHTML='<div class="a-card a-details"><h2>交易数据待获取</h2><p>当前分析包含交易步骤，需先取得交易数据。</p></div>';return}return ['login-conversion','invite-conversion'].includes(mode)?pages[mode].draw(current):mode==='north'?drawNorth(current):mode==='channels'?drawChannels(current):mode==='paths'?drawPaths(current):mode==='funnel'?drawFunnel(current):mode==='retention'?drawRetention(current):mode==='referral'?drawReferral(current):mode==='value'?drawValueLoop(current):mode==='trade-monitor'?drawTradeMonitor(current):drawSegments(current)}
function navigate(nextMode,options={}){if(options.platform){audience=null;task=null;pages.segments.configureAudience?.(null);if(Number.isFinite(options.asOf))asof=options.asOf}navigationGeneration++;mode=nextMode==='tasks'?'north':nextMode;sectionNavigation.update(mode);$('#as-title').textContent=pageTitle();$('#as-sub').textContent=pageSub();renderSteps();if(options.platform){const sel=$('#as-range');if([...sel.options].some(o=>o.value===String(options.days)))sel.value=String(options.days);$('#as-source').value='all'}if((task||audience)&&AUDIENCE_MODES.has(mode))$('#as-source').value=audience?.source||'all';run()}
globalThis.__refreshRemoteAnalytics=async meta=>{
  if(!Number.isFinite(Date.parse(meta.as_of)))throw new Error('数据截止时间无效')
  asof=Date.parse(meta.as_of);dataStore.meta.asOf=asof;dataStore.meta.snapshot_cutoff=meta.snapshot_cutoff;dataStore.meta.capabilities=meta.capabilities;
  dataStore.meta.funnelSteps=meta.funnel_steps??null;dataStore.meta.sources=meta.sources??[];dataStore.meta.strategies=meta.strategies??[];
  dataStore.meta.dataVersion=meta.data_version;dataStore.meta.eventCount=meta.event_count;
  $('#as-data-time').textContent='观测截至 '+clock(asof)+' · UTC+7';
  $('#as-data-badge').textContent='远程数据 · '+fmt(meta.event_count)+' 事件';
  $('#as-data-status').textContent='Hologres 数据 · 最近刷新 '+clock(Date.parse(meta.last_success_at))+' · 已观测数据，完整覆盖未确认';
  if(dirty||(mode==='trade-monitor'?pages.tradeMonitor:pages[mode])?.hasPendingChanges?.()){
    $('#as-data-status').textContent+=' · 筛选尚未应用，当前保留上次分析结果；请应用修改。'
    return
  }
  if(task){$('#as-data-status').textContent+=' · 当前任务仍使用原快照；结束任务后可开始新数据分析';renderTaskBar();return}
  await run();
};
const pageContext={renewAnalysisSnapshot,openOperationTask:id=>operationTaskDetail.open(id),getAudience:()=>audience,refreshCohorts:()=>{cohortManager?.refresh();tagAnalysis.draw(mode)},openUserProfile:(id,c)=>userProfile.open(id,c),dataStore,usersById,drawer,userButton,userTimeline,isMock,isAgg,setPeriod:value=>{$('#as-range').value=value;run()},getAudiencePeriod:()=>audience&&AUDIENCE_MODES.has(mode)?{startAt:audience.start,endAt:audience.end}:null,root,$,$$,names,day,base,asof,date,clock,daynum,esc,fmt,pct,table,stat,drill,closeDrill,themeMedia,getUsers:()=>users,getTradeQuality:()=>dataStore.tradeQuality,getCoverage:()=>coverage,historyComplete:dataStore.meta.historyComplete,clear:clearNative};
const userProfile=createUserProfile({...pageContext,analyzeAudience:applyAudience,createActivityForUsers:ids=>{pages.activities.startForUsers(ids);navigate('activities')}});
const operationTaskDetail=createOperationTaskDetail({...pageContext,analyzeAudience:applyAudience,onChanged:()=>{if(mode==='workbench')pages.workbench.draw()}});
const pages={
  'login-conversion':createConversionPage(pageContext,'login'),
  'invite-conversion':createConversionPage(pageContext,'invite'),
  'operations-compare':createOperationsComparison(pageContext),
  workbench:createWorkbench({...pageContext,openKol:id=>{pages.crm.openKol(id);navigate('crm')},openActivity:id=>{pages.activities.openActivity(id);navigate('activities')},openUserProfile:(id,c)=>userProfile.open(id,c)}),
  'my-monitor':createMyMonitor({...pageContext,navigate}),
  activities:createActivityMonitor({...pageContext,analyzeTag,analyzeAudience:applyAudience,openKol:id=>{pages.crm.openKol(id);navigate('crm')}}),
  crm:createKolCrm({...pageContext,analyzeAudience:applyAudience,openActivity:id=>{pages.activities.openActivity(id);navigate('activities')},createActivityForKol:kol=>{pages.activities.startForKol(kol);navigate('activities')}}),
  home:createHomeMonitor({...pageContext,navigate,onMetadata:meta=>{asof=Date.parse(meta.as_of);dataStore.meta.asOf=asof;$('#as-data-time').textContent='观测截至 '+clock(asof)+' · UTC+7'},navigatePlatform:(m,o)=>navigate(m,{...o,platform:true})}),
  north:isAgg?createNorthStarAggPage(pageContext):createNorthStarPage(pageContext),
  channelsAgg:createChannelsAggPage(pageContext),
  funnel:isAgg?createFunnelAggPage(pageContext):createFunnelPage(pageContext),
  referral:isAgg?createReferralAggPage(pageContext):createReferralPage(pageContext),
  segments:isAgg?createSegmentsAggPage(pageContext):createSegmentsPage(pageContext),
  paths:isAgg?createPathsAggPage(pageContext):createPathsPage(pageContext),
  tradeMonitor:isAgg?createTradeMonitorAggPage(pageContext):createTradeMonitorPage(pageContext),
  retention:isAgg?createRetentionAggPage(pageContext):createRetentionPage(pageContext),
};
$$('[data-conversion-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.conversionView));
$$('[data-acquisition-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.acquisitionView));
$('#as-add').onclick=()=>{if(steps.length<5){steps.push('chip');renderSteps();markDirty()}};['#as-range','#as-window','#as-source','#as-strategy','#as-association'].forEach(s=>$(s).onchange=()=>{if(s==='#as-range'){rememberReportPeriod({...inheritedReportPeriod(),days:$('#as-range').value==='custom'?'custom':Number($('#as-range').value)});renderCustomRange()}if($('#as-range').value!=='custom')northDefinition();markDirty()});$('#as-run').onclick=run;$('#as-preset').onchange=()=>{const v=$('#as-preset').value;if(v==='custom')return;steps=v==='visit_login'?['daily_visit','logged_in_visit']:v==='logged_in'?['logged_in_visit','token','chip']:v==='token_visit'?['token_click','token','chip']:v==='strategy_run'?['ai','strategy_result','signal_view']:v==='ai'?['login','token','ai','chip']:['login','token','chip'];$('#as-association').value=['token_visit','strategy_run'].includes(v)?v:'user';renderSteps();markDirty()};$('#as-save').onclick=()=>{const next=config();try{saveConfig(localStorage,next);saved=next;$('#as-saved').textContent='配置已保存，可在刷新后载入';$('#as-restore').hidden=false}catch{$('#as-saved').textContent='保存失败，浏览器存储不可用'}};$('#as-restore').onclick=()=>{if(!saved)return;mode=saved.mode==='tasks'?'north':saved.mode;steps=[...saved.steps];sectionNavigation.update(mode);$('#as-title').textContent=pageTitle();$('#as-sub').textContent=pageSub();renderSteps();$('#as-range').value=saved.period||saved.range;if(!$('#as-range').value)$('#as-range').value=mode==='paths'?'7':'14';$('#as-window').value=saved.hours;$('#as-association').value=saved.association||'user';$('#as-source').value=saved.source;$('#as-strategy').value=saved.strategy;if(mode==='retention'){$('#as-initial').value=saved.initial;$('#as-return').value=saved.returning}if(mode==='paths'){$('#as-path-start').value=saved.pathStart||'all';$('#as-path-stop').value=saved.pathStop||'none';$('#as-path-depth').value=saved.pathDepth||5}run();$('#as-saved').textContent='已载入保存的配置'};$('#as-range').querySelectorAll('option').forEach(o=>{const end=Math.floor((asof+7*3600000)/day)*day-7*3600000;o.textContent=date(end-(+o.value)*day)+'–'+date(end-day)+' · '+o.value+' 天'});try{saved=loadConfig(localStorage)}catch{}$('#as-restore').hidden=!saved;sectionNavigation.update(mode);$('#as-title').textContent=pageTitle();$('#as-sub').textContent=pageSub();renderSteps();run();
})();
