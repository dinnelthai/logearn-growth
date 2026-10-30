import {getAnalysisDetail,getEvidence,getJobCheckpoint,retryAnalysis,continueWeeklyOverflow,deleteAnalysis,getGscPerformance} from '../api/aiAnalysis.js';
import {canOfferTaskRetry} from './aiTaskStatus.js';
import {queueAnalysisLaunch} from '../analysisLaunchContext.js';
import {renderWeeklyDecisionReport,readOnlyGscMarkup} from './aiWeeklyDecisionView.js';

const DAY=86400000;
const date=ms=>Number.isFinite(Number(ms))?new Date(Number(ms)+7*3600000).toISOString().slice(0,10):'未知';
const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未知';
const statuses={pending:'排队中',processing:'AI 正在分析',completed:'已完成',failed:'生成失败',cancelled:'已取消'};
export function mountAIWeeklyReport(root,{api,safe,navigate,onCreateProblem=null}){
 let disposed=false,seq=0,poll=null,selected=null,busy=false,recoveryQueued=false,notice='',lastSnapshot=null;
 const clear=()=>{if(poll){clearTimeout(poll);poll=null}};
 const schedule=(rows,token)=>{
  if(!disposed&&token===seq&&(recoveryQueued||
   rows.some(x=>['pending','processing'].includes(x.status))))
   poll=setTimeout(()=>load({silent:true}),6000);
 };
 // Hold the section's previous height while an actual status transition is
 // rendered and its detailed report is being fetched. This prevents the
 // document from collapsing under the user's current scroll position.
 const protectHeight=()=>{
  if(!root.style||typeof root.getBoundingClientRect!=='function')return ()=>{};
  const previous=root.style.minHeight;
  const height=root.getBoundingClientRect().height;
  if(height>0)root.style.minHeight=Math.ceil(height)+'px';
  return ()=>{root.style.minHeight=previous};
 };
 const links=ids=>(Array.isArray(ids)?ids:[]).map(id=>
  '<button type="button" class="a-button" data-weekly-evidence="'+safe(id)+'" title="查看来源证据">证据 '+safe(String(id).slice(0,8))+'</button>').join(' ');
 const section=(title,items,render)=>
  '<section class="ai-weekly-section"><h4>'+safe(title)+'</h4>'+
  (items?.length?'<ul>'+items.map(render).join('')+'</ul>':'<p class="a-muted">暂无经验证的内容，不能据此断定该项正常。</p>')+'</section>';
 const reportBody=(data,record)=>renderWeeklyDecisionReport({data,record,safe,fmt,date,links,canCreateProblem:typeof onCreateProblem==='function'});

 async function showReport(row,token,currentPeriod){
  const target=root.querySelector('[data-weekly-body]');if(!target)return;
  if(row.status!=='completed'){
   target.innerHTML='<p '+(row.status==='failed'?'role="alert"':'class="a-muted"')+'>'+
    (row.status==='failed'?'本次生成失败：'+safe(row.error_message||'原因待核查')+'。':
     row.status==='cancelled'?'周报已取消。':'分析任务已保存，等待 Worker 完成。期间可能产生模型费用。')+'</p>'+
    (row.status==='failed'?'<div data-weekly-retry-state role="status">正在检查已发起的模型调用，确认能否安全重试…</div>':'');
   if(row.status==='failed'){
    const status=target.querySelector('[data-weekly-retry-state]');
    if(!status)return;
    try{
     const checkpoint=await getJobCheckpoint(row.id);
     if(disposed||token!==seq||!status.isConnected)return;
     const timedOut=/(?:timed out|timeout|请求超时|模型请求超时)/i.test(row.error_message||'');
     const billingLabels={'not-started':'尚未发起调用','received':'已确认收到响应',
      'uncertain':'请求已发出，响应和费用待核对','mismatch':'本地与共享账本不一致'};
     if(recoveryQueued){
      status.textContent='已提交断点续跑，正在等待 Worker 领取任务。原始模型响应不会重新付费。';
     }else if(checkpoint.safeToRetry===true&&canOfferTaskRetry({status:row.status,cancel_requested:false},checkpoint)){
      status.innerHTML='<p>检查点没有模型调用记录。可以手动重试；后端还会核查共享付费账本，确认安全才会入队。</p>'+
       '<button type="button" class="a-button" data-weekly-retry>重新生成本周报</button>';
      status.querySelector('[data-weekly-retry]')?.addEventListener('click',async event=>{
       if(busy)return;
       busy=true;
       const button=event.currentTarget;
       button.disabled=true;button.textContent='正在重新核对…';
       try{
        const fresh=await getJobCheckpoint(row.id);
        if(fresh.safeToRetry!==true||!canOfferTaskRetry({status:row.status,cancel_requested:false},fresh))
         throw Error('任务检查点已变化，无法安全重试');
        await retryAnalysis(row.id);
        if(!disposed){selected=row.id;await load()}
       }catch(error){
        if(!disposed&&button.isConnected){
         button.disabled=false;button.textContent='重新生成本周报';
         status.querySelector('p').textContent='重试被拒绝：'+error.message+'。不会绕过付费账本检查。';
        }
       }finally{busy=false}
      });
     }else if(['补充查询过多，请缩小问题范围或提高调查能力',
      'AI Token硬预算不足，未发起下一轮模型请求；已付费证据保留在断点'].includes(row.error_message)&&
      checkpoint.paidCallState==='received'&&checkpoint.recordStatus==='failed'&&checkpoint.modelCalls>0&&
      ['partial-tools','recorded'].includes(checkpoint.state)){
      status.innerHTML='<p>已保存的模型响应和证据可复用。原任务不会从头重新计费；点击继续后，后续尚未发起的模型轮次可能产生新费用。系统会重新核对断点和共享付费账本。</p>'+
       '<button type="button" class="a-button" data-weekly-continue>继续周报（可能新增模型费用）</button>';
      status.querySelector('[data-weekly-continue]')?.addEventListener('click',async event=>{
       if(busy)return;
       busy=true;
       const button=event.currentTarget;button.disabled=true;button.textContent='正在验证断点…';
       try{
        const resumed=await continueWeeklyOverflow(row.id);
        if(disposed)return;
        recoveryQueued=true;selected=resumed.analysisId;
        await load();
       }catch(error){
        if(!disposed&&button.isConnected){
         button.disabled=false;button.textContent='继续周报（可能新增模型费用）';
         status.querySelector('p').textContent='安全续跑未启动：'+error.message;
        }
       }finally{busy=false}
      });
     }else{
      status.textContent=(timedOut
       ?'模型连接已超时，但无法确认请求是否已被上游处理或计费。'
       :'无法安全重新执行当前任务。')+
       '共享付费账本：'+(billingLabels[checkpoint.paidCallState]||'状态待核查')+
       '；已登记调用 '+Number(checkpoint.paidCallCount||0)+' 次。'+
       '不能在原任务上重试。建议先到模型中转站核查对应时间的请求与账单。';
      const currentWeek=Number(row.date_range_start)===Number(currentPeriod?.start)&&
        Number(row.date_range_end)===Number(currentPeriod?.end);
      if(timedOut&&checkpoint.paidCallState==='uncertain'&&
        !row.weekly_reissue_of&&currentWeek){
       const form=document.createElement('div');
       form.className='ai-weekly-unknown-charge';
       form.innerHTML='<p>如仍需本周周报，可以人工发起一次全新的付费分析。原请求可能已经计费；新任务不会覆盖旧账本，也不会再次提供自动重试。</p>'+
        '<label><input type="checkbox" data-weekly-cost-ack> 我知道前一次模型请求的费用尚未确认，同意本次重新调用模型可能重复产生费用。</label>'+
        '<button type="button" class="a-button" data-weekly-new-attempt disabled>创建一次新的 AI 周报</button>';
       status.append(form);
       const ack=form.querySelector('[data-weekly-cost-ack]');
       const button=form.querySelector('[data-weekly-new-attempt]');
       ack.addEventListener('change',()=>{button.disabled=!ack.checked});
       button.addEventListener('click',async()=>{
        if(busy||!ack.checked)return;
        busy=true;button.disabled=true;button.textContent='正在创建独立任务…';
        try{
         const result=await api('/ai-weekly-reports/'+encodeURIComponent(row.id)+'/new-attempt',
          'POST',{acceptPotentialDuplicateCharge:true});
         if(disposed)return;
         selected=result.analysisId;await load();
        }catch(error){
         if(!disposed&&button.isConnected){
          button.textContent='创建一次新的 AI 周报';
          button.disabled=!ack.checked;
          status.querySelector('p').textContent='创建被拒绝：'+error.message;
         }
        }finally{busy=false}
       });
      }
     }
    }catch(error){
     if(!disposed&&token===seq&&status.isConnected)
      status.textContent='无法核对付费记录，暂不允许重试：'+error.message;
    }
   }
   return;
  }
  try{
   const detail=await getAnalysisDetail(row.id);
   if(disposed||token!==seq)return;
   target.innerHTML=reportBody(detail,row);
   const gscSupplement=target.querySelector('[data-weekly-gsc-live]');
   if(gscSupplement){
    const startDate=date(row.date_range_start),endDate=date(Number(row.date_range_end)-DAY);
    // Historical reports can display an EXACT saved GSC snapshot without
    // retroactively claiming that the original AI model analyzed those data.
    getGscPerformance({startDate,endDate}).then(snapshot=>{
     if(!disposed&&token===seq&&gscSupplement.isConnected)
      gscSupplement.innerHTML=readOnlyGscMarkup(snapshot,{safe,fmt,startDate,endDate});
    }).catch(error=>{
     if(!disposed&&token===seq&&gscSupplement.isConnected)
      gscSupplement.textContent='GSC 数据暂不可读取：'+error.message+'。请前往 SEO 分析查看同步状态。';
    });
   }

   target.querySelectorAll('[data-weekly-navigate]').forEach(button=>
    button.addEventListener('click',()=>{if(typeof navigate==='function')navigate(button.dataset.weeklyNavigate)}));
   target.querySelectorAll('[data-weekly-section]').forEach(button=>
    button.addEventListener('click',()=>{
     target.querySelector('#'+button.dataset.weeklySection)?.scrollIntoView?.({block:'start'});
    }));
   if(typeof onCreateProblem==='function'){
    target.querySelectorAll('[data-weekly-create-problem]').forEach(button=>
     button.addEventListener('click',async()=>{
      const card=button.closest('.ai-weekly-problem');
      const subject=card?.querySelector('.ai-weekly-problem-title strong')?.textContent?.trim().slice(0,120);
      const description=card?.querySelector('.ai-weekly-problem-content > p')?.textContent?.trim().slice(0,1200);
      if(!subject||button.disabled)return;
      button.disabled=true;button.textContent='正在保存…';
      const note=target.querySelector('[data-weekly-action-note]');
      try{
       await onCreateProblem({subject,description:description||subject});
       if(disposed||token!==seq||!button.isConnected)return;
       button.textContent='已加入问题池';
       if(note)note.textContent='已记录待处理问题；创建调查和付费模型调用仍需要单独操作。';
      }catch(error){
       if(!button.isConnected)return;
       button.disabled=false;button.textContent='加入问题池';
       if(note)note.textContent='加入问题池失败：'+error.message;
      }
     }));
   }
   target.querySelectorAll('[data-weekly-evidence]').forEach(button=>button.addEventListener('click',async()=>{
    const out=target.querySelector('[data-weekly-evidence-detail]');
    button.disabled=true;out.hidden=false;out.textContent='正在读取归档证据…';
    try{out.textContent=JSON.stringify(await getEvidence(button.dataset.weeklyEvidence),null,2)}
    catch(error){out.textContent='读取证据失败：'+error.message}
    finally{if(button.isConnected)button.disabled=false}
   }));
  }catch(error){if(!disposed&&token===seq)target.textContent='周报详情暂不可用：'+error.message}
 }
 async function load({silent=false}={}){
  clear();const token=++seq;
  // The loading placeholder is used only for the initial mount. Replacing a
  // long page with one short line on every poll makes the browser scroll up.
  if(lastSnapshot===null&&!silent)
   root.innerHTML='<p class="a-muted">正在读取 AI 周报任务与历史…</p>';
  let releaseHeight=null;
  try{
   const d=await api('/ai-weekly-reports');
   if(disposed||token!==seq)return;
   const rows=Array.isArray(d.reports)?d.reports:[];
   if(!rows.some(x=>x.id===selected))selected=rows[0]?.id||null;
   const current=rows.find(x=>Number(x.date_range_start)===Number(d.period.start)&&Number(x.date_range_end)===Number(d.period.end));
   const row=rows.find(x=>x.id===selected);
   const regenerateArchived=!current&&d.canRegenerateArchivedFailed===true;
   const canRegenerateCurrent=!!current&&['completed','failed','cancelled'].includes(current.status);
   const nextSnapshot=JSON.stringify({
    period:d.period,archivedCurrentWeek:d.archivedCurrentWeek,
    canRegenerateArchivedFailed:d.canRegenerateArchivedFailed,selected,
    rows:rows.map(x=>({id:x.id,status:x.status,title:x.title,
     error_message:x.error_message,completed_at:x.completed_at,
     cost_usd:x.cost_usd,model_name:x.model_name}))
   });
   if(silent&&lastSnapshot===nextSnapshot){
    schedule(rows,token);
    return; // No reflow, no lost focus, no scroll movement.
   }
   if(lastSnapshot!==null)releaseHeight=protectHeight();
   lastSnapshot=nextSnapshot;
   if(row&&row.status!=='failed')recoveryQueued=false;
   if(row&&row.error_message&&row.error_message!=='补充查询过多，请缩小问题范围或提高调查能力')recoveryQueued=false;
   root.innerHTML='<div class="ai-weekly-heading"><div><h3>AI 运营周报</h3><p class="a-muted">最近完整周：'+
    safe(date(d.period.start))+' — '+safe(date(d.period.end-DAY))+' · UTC+7</p></div>'+
    (current?'<div class="ai-weekly-toolbar">'+
      '<span class="ai-weekly-status">'+safe(row?'正在查看 · '+(statuses[row.status]||row.status):
       '本期 · '+(statuses[current.status]||current.status))+'</span>'+
      '<button type="button" class="a-button ai-weekly-regenerate-trigger" data-weekly-regenerate '+
       (canRegenerateCurrent?'':'disabled title="本期周报正在生成中"')+'>'+
       '重新生成 AI 运营周报</button></div>':
     regenerateArchived?'<button type="button" class="a-button a-primary" data-weekly-confirm>重新生成 AI 周报</button>':
     d.archivedCurrentWeek?'<span class="ai-weekly-status">本周记录已移除</span>':
     '<button type="button" class="a-button a-primary" data-weekly-confirm>生成 AI 周报</button>')+'</div>'+
    (canRegenerateCurrent?
     '<div class="ai-weekly-regenerate-confirm" data-weekly-regenerate-confirm hidden>'+
     '<p><strong>重新生成最近完整周的 AI 运营周报？</strong>将重新读取业务数据，并创建一份独立的新周报。旧报告、证据与历史费用全部保留；本次可能再次产生模型费用，不会自动重试失败调用。</p>'+
     '<div class="ai-weekly-regenerate-buttons">'+
     '<button type="button" class="a-button" data-weekly-regenerate-cancel>取消</button>'+
     '<button type="button" class="a-button a-primary" data-weekly-regenerate-submit>确认重新生成（可能收费）</button>'+
     '</div></div>':'')+
    (regenerateArchived?
     '<p>上一份失败周报已移出列表。点击重新生成会创建独立的付费模型任务，之前的调用和费用仍保留，可能产生重复费用；重复点击不会创建多份新任务。</p>':
     '<p>分析上个完整自然周的真实业务数据，形成问题、证据与下周行动。单击生成将调用可能收费的模型；同一周不会重复创建任务。</p>')+
    (rows.length?'<label class="ai-weekly-picker">查看历史周报 <select data-weekly-select>'+
     rows.map(x=>'<option value="'+safe(x.id)+'" '+(x.id===selected?'selected':'')+'>'+
      safe(date(x.date_range_start))+' — '+safe(date(Number(x.date_range_end)-DAY))+' · '+
      safe(statuses[x.status]||x.status)+'</option>').join('')+'</select></label>':
     '')+
    (row?'<button type="button" class="a-button" data-weekly-inspect>查看原始 AI 调查记录、检查点与费用</button>':'')+
    (row?.status==='failed'?
     '<button type="button" class="a-button ai-weekly-delete-trigger" data-weekly-delete>删除失败周报</button>'+
     '<div class="ai-weekly-delete-confirmation" data-weekly-delete-confirmation hidden>'+
     '<p>将这条失败周报从周报列表和历史分析中移除。已产生的模型费用、调用证据与原始任务会保留用于核对；不会清除付费记录或自动重新生成。</p>'+
     '<div><button type="button" class="a-button" data-weekly-delete-cancel>取消</button>'+
     '<button type="button" class="a-button ai-weekly-delete-submit" data-weekly-delete-submit>确认删除</button></div></div>':'')+
    '<div data-weekly-body aria-live="polite"></div><p data-weekly-note role="status">'+safe(notice)+'</p>';
   root.querySelector('[data-weekly-select]')?.addEventListener('change',e=>{selected=e.target.value;load()});
   root.querySelector('[data-weekly-inspect]')?.addEventListener('click',()=>{
    if(!row||typeof navigate!=='function')return;
    queueAnalysisLaunch({kind:'analysis',analysisId:row.id});
    navigate('ai-analysis');
   });
   const regeneration=root.querySelector('[data-weekly-regenerate-confirm]');
   root.querySelector('[data-weekly-regenerate]')?.addEventListener('click',()=>{
    if(busy||!canRegenerateCurrent||!regeneration)return;
    regeneration.hidden=false;
    regeneration.querySelector('[data-weekly-regenerate-cancel]')?.focus();
   });
   root.querySelector('[data-weekly-regenerate-cancel]')?.addEventListener('click',()=>{
    regeneration.hidden=true;
    root.querySelector('[data-weekly-regenerate]')?.focus();
   });
   root.querySelector('[data-weekly-regenerate-submit]')?.addEventListener('click',async event=>{
    if(busy||!current||!canRegenerateCurrent)return;
    busy=true;
    const button=event.currentTarget;
    button.disabled=true;button.textContent='正在创建新周报…';
    try{
     const result=await api('/ai-weekly-reports/'+encodeURIComponent(current.id)+'/regenerate',
      'POST',{acceptPotentialDuplicateCharge:true});
     if(disposed)return;
     selected=result.analysisId;
     notice=result.notice||'已提交独立的周报任务，旧记录和费用保留。';
     await load();
    }catch(error){
     if(!disposed&&button.isConnected){
      button.disabled=false;button.textContent='确认重新生成（可能收费）';
      const status=root.querySelector('[data-weekly-note]');
      if(status)status.textContent='重新生成未开始：'+error.message;
     }
    }finally{busy=false}
   });
   const deletion=root.querySelector('[data-weekly-delete-confirmation]');
   root.querySelector('[data-weekly-delete]')?.addEventListener('click',()=>{
    if(!deletion||busy)return;
    deletion.hidden=false;
    deletion.querySelector('[data-weekly-delete-cancel]')?.focus();
   });
   root.querySelector('[data-weekly-delete-cancel]')?.addEventListener('click',()=>{
    deletion.hidden=true;
    root.querySelector('[data-weekly-delete]')?.focus();
   });
   root.querySelector('[data-weekly-delete-submit]')?.addEventListener('click',async event=>{
    if(busy||row?.status!=='failed')return;
    busy=true;
    const button=event.currentTarget;
    button.disabled=true;button.textContent='正在删除…';
    try{
     await deleteAnalysis(row.id);
     if(disposed)return;
     selected=null;recoveryQueued=false;
     notice='失败周报已从列表移除；原始费用和审计记录保留。';
     await load();
    }catch(error){
     if(!disposed&&button.isConnected){
      button.disabled=false;button.textContent='确认删除';
      const status=root.querySelector('[data-weekly-note]');
      if(status)status.textContent='删除失败：'+error.message;
     }
    }finally{busy=false}
   });
   root.querySelector('[data-weekly-confirm]')?.addEventListener('click',async event=>{
    if(busy)return;
    busy=true;
    const button=event.currentTarget;
    button.disabled=true;button.textContent='正在提交…';
    const note=root.querySelector('[data-weekly-note]');
    if(note)note.textContent='正在创建本周 AI 分析任务…';
    try{
     const result=await api('/ai-weekly-reports','POST',
      regenerateArchived?{regenerateArchivedFailed:true}:{});
     selected=result.analysisId;
     if(!disposed)await load();
    }catch(error){
     if(!disposed&&button.isConnected){
      button.disabled=false;button.textContent=regenerateArchived?'重新生成 AI 周报':'生成 AI 周报';
      if(note)note.textContent='提交失败：'+error.message;
     }
    }finally{busy=false}
   });
   if(row)await showReport(row,token,d.period);
   schedule(rows,token);
  }catch(error){
   if(!disposed&&token===seq){
    if(silent&&lastSnapshot!==null){
     const note=root.querySelector('[data-weekly-note]');
     if(note)note.textContent='周报状态刷新暂时失败：'+error.message;
     poll=setTimeout(()=>load({silent:true}),6000);
    }else{
     root.innerHTML='<p role="alert">AI 周报读取失败：'+safe(error.message)+'</p><button type="button" class="a-button" data-weekly-retry>重新读取</button>';
     root.querySelector('[data-weekly-retry]')?.addEventListener('click',()=>load());
    }
   }
  }finally{releaseHeight?.()}
 }
 load();
 return ()=>{disposed=true;seq++;clear()};
}
