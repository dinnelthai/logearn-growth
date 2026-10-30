import {mountUserCrm} from './userCrm.js'
import {loadingState} from './loadingState.js'
import {beginPageLoad} from './pageLoading.js'
import {viewState} from '../components/viewStates.js'
import {fetchWorkbench,setFollowupStatus} from '../api/userOperations.js'
import {observedTime} from './observedDrill.js'
import {getGrowthInbox} from '../api/aiAnalysis.js'
import {queueAnalysisLaunch} from '../analysisLaunchContext.js'
export function createWorkbench(ctx){
 const {$,esc,fmt,table}=ctx;let epoch=0,data=null,aiInbox=null,filter='due',page=0,crm=null,pendingFocus=null
 const host=()=>$('#as-output')
 function render(preserveCrm=true){const oldCrm=preserveCrm?host().querySelector('[data-work-crm]'):null;if(!oldCrm)crm?.dispose();const s=data.summary,now=data.as_of,tasks=data.tasks.filter(t=>filter==='done'?t.status==='done':t.status!=='done'&&(filter==='all'||filter==='due'&&t.due_at!=null&&t.due_at<=now||t.type===filter))
  const maxPage=Math.max(0,Math.ceil(tasks.length/20)-1);
  page=Math.min(Math.max(0,page),maxPage);
  const current=tasks.slice(page*20,(page+1)*20)
  host().innerHTML=`<div class="si-page operations-workbench"><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>运营待办</h2><p class="a-muted">当前账号的转化任务、KOL跟进、活动预约与结算、用户回访与固定人群任务</p></div><button class="a-button" data-work-refresh>刷新</button></div><div class="crm-kpis">${[['到期待办',s.due,'due'],['转化待跟进',s.conversion_due||0,'conversion'],['KOL待跟进',s.kol_due,'kol'],['活动待结算',s.activity_pending,'activity'],['预约活动',s.activities_scheduled||0,'activity_start'],['用户待回访',s.user_due,'user'],['人群待跟进',s.group_due||0,'task']].map(([label,n,key])=>`<button class="si-kpi" data-work-filter="${key}"><span>${label} ↗</span><strong>${fmt(n)}</strong></button>`).join('')}</div><p class="a-muted">进行中活动 ${fmt(s.activities_active)} 个 · 未完成的人群任务 ${fmt(s.groups_open||0)} 个 · 已完成待办 ${fmt(s.completed)} 条</p></section><section class="a-card si-panel"><div class="a-audience-actions">${[['due','已到期'],['all','全部待办'],['kol','KOL跟进'],['activity','活动结算'],['activity_start','预约启动'],['user','用户回访'],['task','人群任务'],['conversion','转化任务'],['done','已完成']].map(([key,label])=>`<button class="a-button ${filter===key?'a-primary':''}" data-work-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('')}</div>${current.length?table(['对象','需要处理','计划时间 · UTC+7','状态','操作'],current.map(t=>[esc(t.title),esc(t.description),observedTime(t.due_at),t.status==='done'?'已完成':t.status==='in_progress'?'处理中':t.due_at==null?'待安排':t.due_at<=now?'已到期':'未到期',`<button class="a-tablelink" data-work-open="${esc(t.id)}">${{conversion:'查看转化任务',kol:'去跟进',activity:'查看活动',activity_start:'查看预约',user:'查看用户',task:'处理任务'}[t.type]} ↗</button>${t.type==='user'?` <button class="a-button" data-work-status="${esc(t.id)}">${t.status==='done'?'重新打开':'标记完成'}</button>`:''}`])):'<p class="si-empty">当前没有匹配待办。</p>'}<div class="rf-pagination"><span>${fmt(tasks.length)} 条 · 第 ${page+1}/${Math.max(1,Math.ceil(tasks.length/20))} 页</span><button class="a-button" data-work-prev ${page?'':'disabled'}>上一页</button><button class="a-button" data-work-next ${(page+1)*20<tasks.length?'':'disabled'}>下一页</button></div><p class="si-error" data-work-error role="status"></p></section><section class="a-card si-panel" aria-label="AI 待办"><div class="si-sectionhead"><h2>AI 待办</h2><button class="a-button" data-work-ai>查看全部</button></div>${aiInbox?.error?'<p role="status">AI 待办暂不可用：'+esc(aiInbox.error)+'</p>':(aiInbox?.tasks||[]).slice(0,5).map(t=>'<article class="work-ai-task"><div><strong>'+esc(t.title||'待核查事项')+'</strong><p class="a-muted">'+esc(t.priority||'')+' · '+esc(t.status||'')+(t.guidance?' · '+esc(t.guidance):'')+'</p></div><button class="a-button" data-work-ai-item="'+esc(t.id)+'">查看详情</button></article>').join('')||'<p>暂无 AI 待办。</p>'}</section><div data-work-crm></div></div>`
  const aiButton=host().querySelector('[data-work-ai]');if(aiButton)aiButton.onclick=()=>ctx.navigate?.('ai-analysis');
  host().querySelectorAll('[data-work-ai-item]').forEach(button=>button.onclick=()=>{
    const item=aiInbox?.tasks?.find(task=>task.id===button.dataset.workAiItem);
    if(!item)return;
    if(item.analysisId){
      queueAnalysisLaunch({kind:'analysis',analysisId:item.analysisId});
      ctx.navigate?.('ai-analysis');
    }else if(['growth-alert','investigation-approval','investigation-dispatch'].includes(item.kind)){
      ctx.navigate?.('growth-monitor');
    }else{
      ctx.navigate?.('ai-analysis');
    }
  });
  const crmHost=host().querySelector('[data-work-crm]');if(oldCrm&&crmHost)crmHost.replaceWith(oldCrm);else if(crmHost)crm=mountUserCrm(crmHost,ctx,{onSaved:async()=>{const token=epoch;try{const r=await fetchWorkbench();if(token===epoch&&crmHost.isConnected){data=r;render(true)}}catch(e){if(token===epoch)host().querySelector('[data-work-error]').textContent=e.message}}});
  host().querySelector('[data-work-refresh]').onclick=refresh;host().querySelectorAll('[data-work-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.workFilter;page=0;pendingFocus='[data-work-filter="'+filter+'"]';render()});host().querySelector('[data-work-prev]').onclick=()=>{page--;pendingFocus='[data-work-prev]';render()};host().querySelector('[data-work-next]').onclick=()=>{page++;pendingFocus='[data-work-next]';render()}
  if(pendingFocus){
    host().querySelector(pendingFocus)?.focus?.({preventScroll:true});
    pendingFocus=null;
  }
  host().querySelectorAll('[data-work-open]').forEach(b=>b.onclick=()=>{
    const t=data?.tasks?.find(task=>task.id===b.dataset.workOpen);
    if(!t||!t.target){
      const error=host().querySelector('[data-work-error]');
      if(error)error.textContent='待办记录已更新或目标不存在，请刷新后重试。';
      return;
    }
    const actions={
      kol:ctx.openKol,activity:ctx.openActivity,activity_start:ctx.openActivity,
      task:ctx.openOperationTask,user:ctx.openUserProfile,conversion:ctx.openUserProfile
    };
    const open=actions[t.type];
    if(typeof open!=='function'){
      const error=host().querySelector('[data-work-error]');
      if(error)error.textContent='当前待办类型暂不能打开，请检查相关模块。';
      return;
    }
    open(t.target);
  })
  host().querySelectorAll('[data-work-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const token=epoch,t=data.tasks.find(t=>t.id===b.dataset.workStatus);await setFollowupStatus(t.id,t.status==='done'?'open':'done');if(token===epoch&&b.isConnected)await refresh()}catch(e){if(b.isConnected){host().querySelector('[data-work-error]').textContent=e.message;b.disabled=false}}})
 }
 async function refresh(){
  const token=++epoch;
  const button=host().querySelector('[data-work-refresh]');
  if(button){button.disabled=true;button.textContent='刷新中…';}
  try{
    const [next,ai]=await Promise.all([
      fetchWorkbench(),getGrowthInbox().catch(e=>({error:e.message}))
    ]);
    if(token!==epoch)return;
    data=next;aiInbox=ai;
    // Keep the selected work type, page (within the new bounds) and CRM editor.
    render(true);
  }catch(error){
    if(token!==epoch)return;
    const message=host().querySelector('[data-work-error]');
    if(message)message.textContent='刷新失败，保留当前结果：'+error.message;
  }finally{
    if(button?.isConnected){button.disabled=false;button.textContent='刷新';}
  }
 }
 async function draw(){crm?.dispose();ctx.clear();const token=++epoch;const finishLoading=beginPageLoad(host(),{placeholder:loadingState('正在加载运营待办…'),selector:'.operations-workbench',message:'正在更新运营待办，旧列表暂时保留…'});try{const [r,ai]=await Promise.all([fetchWorkbench(),getGrowthInbox().catch(e=>({error:e.message}))]);if(token!==epoch)return;data=r;aiInbox=ai;render()}catch(e){if(token===epoch){host().innerHTML=viewState({kind:'error',title:'运营待办加载失败',description:e.message,actionLabel:'重试',actionAttr:'data-work-refresh'});host().querySelector('[data-work-refresh]')?.addEventListener('click',draw)}}finally{finishLoading()}}
 return {draw,hasPendingChanges:()=>crm?.hasPendingChanges?.()===true,dispose(){epoch++;crm?.dispose()}}
}
