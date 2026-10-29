import {getBusinessModules,runBusinessModuleInvestigation,getOpportunities,
 saveOpportunity,decideOpportunity,promoteOpportunity,getOpportunityHistory,getEvidence} from '../api/aiAnalysis.js';

const DAY=86400000;
const day=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
const startOfDay=d=>Date.parse(d+'T00:00:00+07:00');
// Only this Agent panel is affected; no changes to manual dashboards or filters.
export function mountAIGrowthModulesPanel(host,{esc}){
 let disposed=false,runResult=null,opportunities=[],modules=[];
 const alive=()=>!disposed&&host.isConnected;
 const period=(days=7)=>{
  const end=startOfDay(day(Date.now()));
  return {start:end-days*DAY,end,timezone:'Asia/Bangkok'};
 };
 const labelStatus=s=>({available:'可用',unavailable:'未配置 / 不可用',complete:'完成',
  partial:'部分完成',no_data:'已确认无数据',proposed:'待调查',investigating:'调查中',
  accepted:'已采纳',executing:'执行中',resolved:'已解决',deferred:'暂缓'}[s]||s||'未知');
 const moduleLabel=id=>({'growth.seo':'SEO','growth.acquisition':'渠道获客','growth.activation':'激活转化','growth.retention':'留存与分群','growth.quality':'数据质量','growth.economics':'渠道经济','growth.referral':'推荐邀请','growth.login':'登录转化'}[id]||id);
 const labelDecision=s=>({implement:'优先考虑实施',investigate:'优先补充调查',
  defer:'暂缓',not_comparable:'暂不可比较'}[s]||'待比较');
 host.innerHTML='<div role="status">正在读取 Agent 模块与机会池…</div>';
 const message=t=>{const el=host.querySelector('[data-growth-modules-message]');if(el)el.textContent=t};
 const draw=()=>{
  if(!alive())return;
  host.innerHTML='<div class="a-card ai-growth-modules">'+
   '<div class="ai-module-heading"><div><span class="ai-module-eyebrow">GROWTH MODULES</span><h2>模块调查与机会池</h2><p>只读聚合证据，帮助你发现值得进一步核查的增长机会。</p></div><span class="ai-module-readonly">只读调查</span></div>'+
   '<div class="ai-module-coverage" aria-label="可用业务模块">'+
   modules.map(m=>'<span class="ai-module-state" data-available="'+(m.status==='available')+'"><span class="ai-module-dot"></span><strong>'+esc(moduleLabel(m.moduleId))+
    '</strong><small>'+esc(labelStatus(m.status))+'</small></span>').join('')+'</div>'+
   '<form data-modules-form class="ai-module-form"><label>调查目标 <select name="goal"><option value="activation">激活</option>'+
   '<option value="retention">留存</option><option value="conversion">转化</option>'+
   '<option value="revenue">收入</option></select></label> '+
   '<label>调查区间 <select name="days"><option value="7">最近 7 个完整日</option><option value="14">最近 14 个完整日</option><option value="28">最近 28 个完整日</option></select></label> '+
   '<label>问题 <input name="question" maxlength="2000" required placeholder="例如：哪个环节可能限制有效分析用户增长？"></label> '+
   '<button type="submit" class="a-button a-primary">开始只读调查 <span>→</span></button></form><p class="ai-module-form-note">按目标固定顺序检查，最多 6 个模块；问题作为调查上下文保存，不改变模块选择顺序，不调用付费模型或发布内容。</p>'+
   '<p role="status" aria-live="polite" data-growth-modules-message></p>'+
   (runResult?'<section class="ai-module-results"><div class="ai-module-section-heading"><div><span class="ai-module-eyebrow">INVESTIGATION</span><h3>调查过程和证据</h3></div><p>结果：'+esc(labelStatus(runResult.result.status))+
    ' · 调用模块 '+runResult.result.steps.length+' · 模型付费调用 0</p></div>'+
    runResult.result.steps.map((step,i)=>'<details class="ai-module-detail"><summary><span class="ai-module-detail-title">'+esc(moduleLabel(step.moduleId))+'</span><span class="ai-module-detail-meta">'+
      esc(labelStatus(step.status==='ok'?'complete':step.status))+' · 证据 '+(step.evidenceIds||[]).length+' 项</span></summary><div class="ai-module-detail-body">'+
      '<p>覆盖：'+esc(step.coverage?.status||'未知')+' · '+esc((step.warnings||[]).join('；')||'未提供')+'</p>'+
      '<p>证据 ID：'+esc((step.evidenceIds||[]).join(', ')||'无')+'</p>'+
      (step.evidenceIds?.length?'<button class="a-button" data-add-module-issue="'+i+
       '">记录为待核查机会</button>':'<p>缺少可引用证据，不创建业务机会。</p>')+
      '</div></details>').join('')+
    (runResult.result.missing||[]).map(x=>'<p>缺口：'+esc(x.moduleId)+' · '+esc(x.reason)+'</p>').join('')+
    '</section>':'')+
   '<section class="ai-module-opportunities"><div class="ai-module-section-heading"><div><span class="ai-module-eyebrow">OPPORTUNITIES</span><h3>可追溯机会榜</h3></div><span class="ai-module-count">'+opportunities.length+' 项</span></div>'+
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
      '<form class="ai-module-inline-form" data-module-decision-form hidden><label>决策理由 <textarea name="reason" maxlength="1000" required placeholder="说明采纳、调查或暂缓的业务依据"></textarea></label><div class="ai-module-form-actions"><button type="submit" class="a-button a-primary">确认决策</button><button type="button" class="a-button" data-module-cancel>取消</button></div></form>'+
      (o.status==='accepted'?'<button type="button" class="a-button" data-module-promote="'+esc(o.id)+'">转入运营待办</button><form class="ai-module-inline-form" data-module-promote-form hidden><label>待办负责人 <input name="assignee" maxlength="100" required placeholder="负责人"></label><div class="ai-module-form-actions"><button class="a-button a-primary" type="submit">确认创建待办</button><button class="a-button" data-module-cancel type="button">取消</button></div></form>':'')+
      '<div class="gws-detail" data-module-history-view="'+esc(o.id)+'" hidden></div></article>').join(''):
      '<div class="ai-module-empty"><strong>暂无已确认的机会</strong><span>调查后可将需要进一步核查的证据记录在这里；不代表各渠道正常。</span></div>')+'</section></div>';
  host.querySelector('[data-modules-form]')?.addEventListener('submit',async event=>{
   event.preventDefault();
   const button=event.target.querySelector('button');button.disabled=true;
   message('正在进行只读调查…');
   const data=new FormData(event.target);
   try{
    const days=Number(data.get('days'));
    const request={goal:String(data.get('goal')),question:String(data.get('question')),
     mode:'full',period:period([7,14,28].includes(days)?days:7),scope:{source:'all'},maxCalls:6};
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

  const revealForm=(form,button)=>{
    if(!form)return;
    form.hidden=false;form.querySelector('input,textarea')?.focus();
    form.dataset.version=button.dataset.version||'';
    form.dataset.next=button.dataset.next||'';
    form.dataset.id=button.dataset.moduleStatus||button.dataset.modulePromote||'';
  };
  host.querySelectorAll('[data-module-cancel]').forEach(button=>button.addEventListener('click',()=>{
    const form=button.closest('form');form.hidden=true;form.reset();
  }));
  host.querySelectorAll('[data-module-promote]').forEach(button=>button.addEventListener('click',()=>
    revealForm(button.parentElement.querySelector('[data-module-promote-form]'),button)));
  host.querySelectorAll('[data-module-promote-form]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const assignee=String(new FormData(form).get('assignee')||'').trim();
    if(!assignee)return;
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
      const linked=await promoteOpportunity(form.dataset.id,{assignee});
      if(alive()){form.hidden=true;message('已创建待办 '+linked.actionId+'，需人工执行并按成熟观察期复盘。');}
    }catch(error){if(alive())message('转入待办失败：'+error.message)}
    finally{if(submit.isConnected)submit.disabled=false}
  }));
  host.querySelectorAll('[data-module-history]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.moduleHistory;
    const out=host.querySelector('[data-module-history-view="'+id+'"]');
    if(!out)return;
    if(!out.hidden){out.hidden=true;button.setAttribute('aria-expanded','false');return}
    button.disabled=true;out.hidden=false;out.textContent='正在读取证据历史…';
    try{
      const item=opportunities.find(x=>x.id===id);
      const [history,...evidence]=await Promise.all([
        getOpportunityHistory(id),...(item?.evidenceIds||[]).slice(0,6).map(e=>getEvidence(e))]);
      if(!alive()||!out)return;
      const entries=Array.isArray(history.history)?history.history:[];
      out.innerHTML='<h4>机会状态历史 · '+entries.length+' 条</h4>'+
        (entries.length?'<ol class="gws-timeline">'+entries.map(e=>'<li><strong>'+esc(e.status||e.action||e.event_type||e.type||'状态更新')+
          '</strong><p>'+esc(e.reason||e.details?.reason||'未填写原因')+'</p><details><summary>详细记录</summary><pre>'+esc(JSON.stringify(e,null,2))+'</pre></details></li>').join('')+'</ol>':'<p>暂无状态历史。</p>')+
        '<h4>原始证据 · '+evidence.length+' 项</h4>'+
        (evidence.length?evidence.map((e,i)=>'<details><summary>证据 '+(i+1)+' · '+esc(e?.metricId||e?.id||'明细')+
          '</summary><pre>'+esc(JSON.stringify(e,null,2))+'</pre></details>').join(''):'<p>没有可读取的原始证据。</p>');
      button.setAttribute('aria-expanded','true');
    }catch(error){if(alive())out.textContent='读取失败：'+error.message}
    finally{if(button.isConnected)button.disabled=false}
  }));
  host.querySelectorAll('[data-module-status]').forEach(button=>button.addEventListener('click',()=>
    revealForm(button.parentElement.querySelector('[data-module-decision-form]'),button)));
  host.querySelectorAll('[data-module-decision-form]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const reason=String(new FormData(form).get('reason')||'').trim();
    if(!reason)return;
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
      await decideOpportunity(form.dataset.id,{status:form.dataset.next,
        expectedVersion:Number(form.dataset.version),reason});
      await load();
    }catch(error){if(alive())message('保存决策失败：'+error.message)}
    finally{if(submit.isConnected)submit.disabled=false}
  }));

 };
 async function load(){
  try{
   const [m,o]=await Promise.all([getBusinessModules(),getOpportunities()]);
   if(!alive())return;
   modules=m.modules||[];opportunities=o.items||[];draw();
  }catch(error){
   if(!alive())return;
   host.innerHTML='<section class="a-card"><h2>模块调查未就绪</h2>'+
    '<p role="alert">'+esc(error.message)+'</p><p>请确认机会池迁移已在授权环境执行；人工分析仍可独立使用。</p>'+
    '<button type="button" class="a-button" data-module-retry>重试</button></section>';
   host.querySelector('[data-module-retry]')?.addEventListener('click',load);
  }
 }
 load();
 return ()=>{disposed=true};
}
