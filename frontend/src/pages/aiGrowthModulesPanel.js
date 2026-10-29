import {getBusinessModules,runBusinessModuleInvestigation,getOpportunities,
 saveOpportunity,decideOpportunity,promoteOpportunity,getOpportunityHistory,getEvidence} from '../api/aiAnalysis.js';

const DAY=86400000;
const day=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
const startOfDay=d=>Date.parse(d+'T00:00:00+07:00');
// Only this Agent panel is affected; no changes to manual dashboards or filters.
export function mountAIGrowthModulesPanel(host,{esc}){
 let disposed=false,runResult=null,opportunities=[],modules=[];
 const alive=()=>!disposed&&host.isConnected;
 const period=()=>{
  const end=startOfDay(day(Date.now()));
  return {start:end-7*DAY,end,timezone:'Asia/Bangkok'};
 };
 const labelStatus=s=>({available:'可用',unavailable:'未配置 / 不可用',complete:'完成',
  partial:'部分完成',no_data:'已确认无数据',proposed:'待调查',investigating:'调查中',
  accepted:'已采纳',executing:'执行中',resolved:'已解决',deferred:'暂缓'}[s]||s||'未知');
 const labelDecision=s=>({implement:'优先考虑实施',investigate:'优先补充调查',
  defer:'暂缓',not_comparable:'暂不可比较'}[s]||'待比较');
 host.innerHTML='<div role="status">正在读取 Agent 模块与机会池…</div>';
 const message=t=>{const el=host.querySelector('[data-growth-modules-message]');if(el)el.textContent=t};
 const draw=()=>{
  if(!alive())return;
  host.innerHTML='<div class="a-card ai-growth-modules">'+
   '<h2>模块调查与机会池</h2><p class="a-muted">只读聚合证据。未观测与零值分开；调查不会自动调用模型或发布内容。</p>'+
   '<div class="ai-module-coverage" aria-label="可用业务模块">'+
   modules.map(m=>'<span class="ai-module-state"><strong>'+esc(m.moduleId.replace('growth.',''))+
    '</strong> · '+esc(labelStatus(m.status))+'</span>').join(' · ')+'</div>'+
   '<form data-modules-form><label>调查目标 <select name="goal"><option value="activation">激活</option>'+
   '<option value="retention">留存</option><option value="conversion">转化</option>'+
   '<option value="revenue">收入</option></select></label> '+
   '<label>问题 <input name="question" maxlength="2000" required placeholder="例如：哪个环节可能限制有效分析用户增长？" style="min-width:280px"></label> '+
   '<button type="submit" class="a-button">开始只读调查（最多6个模块）</button></form>'+
   '<p role="status" aria-live="polite" data-growth-modules-message></p>'+
   (runResult?'<section><h3>调查过程和证据</h3><p>结果：'+esc(labelStatus(runResult.result.status))+
    ' · 调用模块 '+runResult.result.steps.length+' · 模型付费调用 0</p>'+
    runResult.result.steps.map((step,i)=>'<details><summary>'+esc(step.moduleId)+' · '+
      esc(labelStatus(step.status))+' · 证据 '+(step.evidenceIds||[]).length+' 项</summary>'+
      '<p>覆盖：'+esc(step.coverage?.status||'未知')+' · '+esc((step.warnings||[]).join('；')||'未提供')+'</p>'+
      '<p>证据 ID：'+esc((step.evidenceIds||[]).join(', ')||'无')+'</p>'+
      (step.evidenceIds?.length?'<button class="a-button" data-add-module-issue="'+i+
       '">记录为待核查机会</button>':'<p>缺少可引用证据，不创建业务机会。</p>')+
      '</details>').join('')+
    (runResult.result.missing||[]).map(x=>'<p>缺口：'+esc(x.moduleId)+' · '+esc(x.reason)+'</p>').join('')+
    '</section>':'')+
   '<section><h3>可追溯机会榜</h3>'+
   (opportunities.length?opportunities.map(o=>
      '<article class="a-card ai-module-opportunity">'+
      '<strong>'+esc(o.subject)+'</strong> · '+esc(labelStatus(o.status))+
      ' · v'+o.version+'<p>'+esc(o.issue)+'</p>'+
      '<p>'+esc(labelDecision(o.decision?.choice))+' · '+esc((o.decision?.reasons||[]).join('；'))+'</p>'+
      '<p class="a-muted">模块 '+esc(o.moduleId)+' · 置信度 '+esc(o.confidence)+
      ' · 影响 '+(o.impact?.affectedUsers==null?'未知':esc(o.impact.affectedUsers))+
      ' · 预计投入 '+(o.effort?.hours==null?'待估算':esc(o.effort.hours)+'小时')+'</p>'+
      '<button type="button" class="a-button" data-module-history="'+esc(o.id)+'">查看证据/历史</button> '+
      '<button type="button" class="a-button" data-module-status="'+esc(o.id)+'" data-version="'+o.version+
        '" data-next="investigating">调查中</button> '+
      '<button type="button" class="a-button" data-module-status="'+esc(o.id)+'" data-version="'+o.version+
        '" data-next="accepted">采纳</button> '+
      '<button type="button" class="a-button" data-module-status="'+esc(o.id)+'" data-version="'+o.version+
        '" data-next="deferred">暂缓</button>'+
      (o.status==='accepted'?'<button type="button" class="a-button" data-module-promote="'+esc(o.id)+'">转入运营待办</button>':'')+
      '<pre data-module-history-view="'+esc(o.id)+'" hidden></pre></article>').join(''):
      '<p class="a-muted">暂无已确认的机会；不代表各渠道正常。</p>')+'</section></div>';
  host.querySelector('[data-modules-form]')?.addEventListener('submit',async event=>{
   event.preventDefault();
   const button=event.target.querySelector('button');button.disabled=true;
   message('正在进行只读调查…');
   const data=new FormData(event.target);
   try{
    const request={goal:String(data.get('goal')),question:String(data.get('question')),
     mode:'full',period:period(),scope:{source:'all'},maxCalls:6};
    runResult=await runBusinessModuleInvestigation(request);
    if(alive()){draw();message('调查完成。每项结论仍需核对原始证据与成熟度。');}
   }catch(error){if(alive())message(error.message);}
   finally{if(button.isConnected)button.disabled=false;}
  });
  host.querySelectorAll('[data-add-module-issue]').forEach(button=>button.addEventListener('click',async()=>{
   const step=runResult?.result?.steps?.[Number(button.dataset.addModuleIssue)];
   if(!step?.evidenceIds?.length)return;
   button.disabled=true;
   try{
    await saveOpportunity({moduleId:step.moduleId,subject:'核查 '+step.moduleId+' 数据覆盖',
     issue:'当前模块证据需要进一步核对采集范围、时间和成熟度，不代表业务已发生下滑',
     hypothesis:'数据覆盖对业务判断的影响尚未确定',
     action:'人工核验模块数据源、历史水位和可比期间',
     confidence:'unknown',impact:{affectedUsers:null},effort:{hours:null},
     evidenceIds:step.evidenceIds,period:runResult.result.period,
     scope:runResult.result.scope,goalVersion:null,
     metricId:null,definitionVersion:null});
    await load();
   }catch(error){if(alive())message('保存失败：'+error.message)}
   finally{if(button.isConnected)button.disabled=false;}
  }));
  host.querySelectorAll('[data-module-promote]').forEach(button=>button.addEventListener('click',async()=>{
   const assignee=window.prompt('填写运营待办的负责人（必填）');
   if(!assignee?.trim())return;
   button.disabled=true;
   try{
    const linked=await promoteOpportunity(button.dataset.modulePromote,{assignee:assignee.trim()});
    if(alive())message('已创建待办 '+linked.actionId+'，需人工执行并按成熟观察期复盘。');
   }catch(error){if(alive())message('转入待办失败：'+error.message)}
   finally{if(button.isConnected)button.disabled=false;}
  }));
  host.querySelectorAll('[data-module-history]').forEach(button=>button.addEventListener('click',async()=>{
   const id=button.dataset.moduleHistory;
   const out=host.querySelector('[data-module-history-view="'+id+'"]');
   try{
    const item=opportunities.find(x=>x.id===id);
    const [history,...evidence]=await Promise.all([
     getOpportunityHistory(id),...(item?.evidenceIds||[]).slice(0,6).map(e=>getEvidence(e))]);
    if(!alive()||!out)return;
    out.textContent=JSON.stringify({history:history.history,evidence},null,2);
    out.hidden=!out.hidden;
   }catch(error){if(alive())message(error.message)}
  }));
  host.querySelectorAll('[data-module-status]').forEach(button=>button.addEventListener('click',async()=>{
   const reason=window.prompt('填写本次人工决策的原因（必填）');
   if(!reason?.trim())return;
   button.disabled=true;
   try{
    await decideOpportunity(button.dataset.moduleStatus,{status:button.dataset.next,
     expectedVersion:Number(button.dataset.version),reason});
    await load();
   }catch(error){if(alive())message(error.message)}
   finally{if(button.isConnected)button.disabled=false;}
  }));
 };
 async function load(){
  try{
   const [m,o]=await Promise.all([getBusinessModules(),getOpportunities()]);
   if(!alive())return;
   modules=m.modules||[];opportunities=o.items||[];draw();
  }catch(error){
   if(alive())host.innerHTML='<section class="a-card"><h2>模块调查未就绪</h2>'+
    '<p role="alert">'+esc(error.message)+'</p><p>请确认机会池迁移已在授权环境执行；人工分析仍可独立使用。</p>'+
    '<button type="button" class="a-button" data-module-retry>重试</button></section>';
   host.querySelector('[data-module-retry]')?.addEventListener('click',load);
  }
 }
 load();
 return ()=>{disposed=true};
}
