import './businessAnalysis.css';
import {listBusinessReports,createBusinessReport,getBusinessReport,createBusinessAction,updateBusinessAction,reviewBusinessAction} from '../api/businessAnalysis.js';
const DAY=86400000,OFFSET=7*3600000;
const local=t=>new Date(t+OFFSET).toISOString().slice(0,16),day=t=>local(t).slice(0,10);
const labels={active_users:'分析用户',new_users:'首次分析用户',returning_users:'回访分析用户',activation_rate:'24小时激活比例',d7:'D7回访比例',weekly_core:'周核心用户'};
const ratio=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
const number=v=>Number.isFinite(v)?v.toLocaleString('zh-CN'):'—';
const status={pending:'待处理',executing:'执行中',executed:'已执行',rejected:'已拒绝'};
export function reportMarkup(report,esc){
  const {current,previous,growth,weekly}=report;
  const table=(headers,rows)=>`<div class="business-table"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const metrics=Object.keys(current.totals).map(key=>{
    const a=current.totals[key],b=previous.totals[key],change=Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
    return [labels[key]||key,number(a),number(b),change==null?'—':(change>0?'+':'')+number(change),!Number.isFinite(b)?'对比数据不可用':b>0?ratio(change/b):'对比基数为0，比例不适用'];
  });
  return `<section class="a-card"><h2>${esc(report.title)} · 业务证据</h2>
    <p>本期 ${esc(local(report.period.start))} 至 ${esc(local(report.period.end))}（截止不含） · UTC+7 · 来源 ${esc(report.business.scope.source)}</p>
    <p>对比期 ${esc(local(report.period.previousStart))} 至 ${esc(local(report.period.previousEnd))} · 等长窗口</p>
    <p>快照 ${esc(report.snapshot.id)} · 数据截至 ${esc(report.snapshot.asOf)}</p>
    <p>目标：${esc(report.summary.goal)} · ${esc(report.business.question||'未补充业务背景')}</p>
    ${(report.warnings||[]).map(w=>`<p class="business-warning">${esc(w)}</p>`).join('')}
    ${table(['指标','本期','对比期','人数变化','变化比例'],metrics)}
    <details><summary>指标定义</summary>${Object.entries(report.definitions).map(([k,v])=>`<p><strong>${esc(labels[k]||k)}</strong>：${esc(v)}</p>`).join('')}</details></section>
    <section class="a-card"><h2>业务目标进度</h2>${weekly.available?`<p>周核心用户 ${number(weekly.users)} / ${weekly.goal?.progress==null?'本范围无独立目标':number(weekly.goal.users)} · ${weekly.goal?.progress!=null&&weekly.goal?.due_date?'目标日期 '+esc(weekly.goal.due_date):'全平台目标不按来源分摊'}</p><p>进入核心 ${number(weekly.entered)} · 退出核心 ${number(weekly.lost)} · 保持核心 ${number(weekly.retained)}</p><p>${esc(weekly.definition||report.definitions.weekly_core)}</p>`:`<p>周核心指标不可用：${esc(weekly.error||'观察期不足')}</p>`}</section>
    <section class="a-card"><h2>规则优先级 · 供人工确认</h2><p>${esc(report.summary.definition)}</p>
    ${report.candidates.map(c=>`<article class="business-issue"><h3>${esc(c.priority)} · ${esc(c.label)}</h3><p>${esc(c.reason)}</p><p>${esc(c.interpretation)}</p><p>规则分 ${number(c.score)}${c.eligible!=null?' · 成熟样本 '+number(c.eligible):''}${c.gap!=null?' · 目标缺口 '+number(c.gap):''}</p>
      <details><summary>计算依据与人工核查步骤</summary><p>${esc(c.scoreExplanation)}</p><p>${esc(c.priorityExplanation)}</p><ol>${c.checks.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><pre>${esc(JSON.stringify(c,null,2))}</pre></details>
      <form data-business-create-action="${esc(c.id)}"><label>人工行动<input name="title" required maxlength="1000" placeholder="根据证据决定具体做什么"></label><label>人工优先级<select name="priority">${['P0','P1','P2'].map(p=>`<option ${p===c.priority?'selected':''}>${p}</option>`).join('')}</select></label><label>判断依据 / 执行成本<textarea name="note" maxlength="5000"></textarea></label><button class="a-button">加入人工待办</button></form></article>`).join('')||'<p>当前规则没有识别到需要优先核查的事项，不代表业务不存在问题。</p>'}</section>
    <section class="a-card"><h2>渠道激活与成熟回访</h2>${table(['来源','首次观测人数','成熟24小时样本','已激活','待成熟','激活比例','D7成熟样本','D7回访','D7比例'],(growth.channels||[]).map(c=>[c.source,number(c.users),number(c.eligible),number(c.activated),number(c.pending),ratio(c.activation_rate),number(c.d7?.eligible),number(c.d7?.returned),ratio(c.d7?.rate)]))}<p>首次观测不是新注册；比例必须结合分母与采集覆盖判断。</p></section>
    <section class="a-card"><h2>变化贡献</h2>${Object.entries(growth.dimensions||{}).map(([name,rows])=>`<h3>${esc({source:'来源',device:'设备',app_version:'应用版本'}[name]||name)}</h3>${table(['分组','本期','对比期','变化'],rows.map(r=>[r.value,number(r.current),number(r.previous),number(r.delta)]))}`).join('')}<p>不同维度分别拆解，不跨维度相加。</p></section>
    <section class="a-card"><h2>人工行动与效果对比</h2>${(report.actions||[]).map(a=>`<article class="business-issue"><h3>${esc(a.priority)} · ${esc(a.title)} · ${esc(status[a.status]||a.status)}</h3>
      <form data-business-action="${esc(a.id)}"><label>状态<select name="status">${Object.entries(status).map(([value,label])=>`<option value="${value}" ${a.status===value?'selected':''}>${label}</option>`).join('')}</select></label><label>实际执行内容 / 拒绝原因 / 人工判断<textarea name="note" maxlength="5000">${esc(a.note)}</textarea></label><label>执行时间 · UTC+7<input name="executedAt" type="datetime-local" value="${a.executed_at?esc(local(a.executed_at)):''}"></label><button class="a-button">保存人工记录</button></form>
      ${a.status==='executed'?`<button class="a-button" data-business-review="${esc(a.id)}">查看执行前后数据（不调用 AI）</button>`:''}
      ${a.review?`<p>${esc(a.review.conclusion)}</p><p>等长 ${number(a.review.periods.days)} 个完整业务日 · 来源 ${esc(a.review.source)}</p>${a.review.weeklyWindows?`<p>${esc(a.review.weeklyWindows.definition)}</p>`:''}${table(['验证指标','执行前','执行后','变化'],Object.entries(a.review.metricChanges).map(([k,v])=>[labels[k]||k,v.available?number(v.baseline):'数据不可用',v.available?number(v.effect):'数据不可用',v.available?(v.change==null?'基数为0':v.change.toFixed(1)+'%'):'无法判断']))}${(a.review.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join('')}`:''}</article>`).join('')||'<p>你可以直接根据规则事项建立行动，不需要等待 AI 建议。</p>'}</section>
    <section class="a-card"><h2>AI 建议（可选）</h2><p>只在点击后调用模型，基于这份已保存的证据和人工行动补充建议。失败不影响本页数据。</p><button class="a-button" data-business-ai>请 AI 分析这份报告</button><button class="a-button" data-open-ai>查看 AI 历史与建议</button><p role="status" data-business-ai-message></p></section>
    <section class="a-card"><details><summary>完整业务证据与快照</summary><pre>${esc(JSON.stringify(report,null,2))}</pre></details></section>`;
}
export function createBusinessAnalysis(ctx){
  const {$,esc,navigate}=ctx;let generation=0,selected=null,report=null,busy=false;
  const filters={start:day(Date.now()-7*DAY),end:day(Date.now()-DAY),source:'all',goal:'activation',question:'',title:'业务优先级报告'};
  const node=s=>$('#as-output')?.querySelector(s);
  const message=text=>{const n=node('[data-business-message]');if(n)n.textContent=text;};
  const dispose=()=>{generation++;};
  async function show(id,token=generation){
    const result=await getBusinessReport(id);if(token!==generation||selected!==id)return;
    report=result;const target=node('[data-business-report]');if(!target)return;target.innerHTML=reportMarkup(report,esc);bindReport(target,token);
  }
  async function reloadReport(token){if(token===generation&&selected)await show(selected,token);}
  function bindReport(target,token){
    target.querySelectorAll('[data-business-create-action]').forEach(form=>form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;busy=true;
      try{const f=new FormData(form);await createBusinessAction(selected,{candidateId:form.dataset.businessCreateAction,title:f.get('title'),priority:f.get('priority'),note:f.get('note')});await reloadReport(token);}
      catch(error){if(token===generation)message(error.message);}finally{busy=false;}
    });
    target.querySelectorAll('[data-business-action]').forEach(form=>form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;busy=true;
      try{const f=new FormData(form),at=f.get('executedAt');await updateBusinessAction(selected,form.dataset.businessAction,{status:f.get('status'),note:f.get('note'),...(at?{executedAt:Date.parse(at+':00+07:00')}:{})});await reloadReport(token);}
      catch(error){if(token===generation)message(error.message);}finally{busy=false;}
    });
    target.querySelectorAll('[data-business-review]').forEach(button=>button.onclick=async()=>{
      if(busy)return;busy=true;button.disabled=true;
      try{message('正在读取执行前后数据，不调用模型…');await reviewBusinessAction(selected,button.dataset.businessReview);await reloadReport(token);if(token===generation)message('前后数据已保存，请结合业务背景作人工判断。');}
      catch(error){if(token===generation)message(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
    });
    target.querySelector('[data-open-ai]').onclick=()=>navigate?.('ai-analysis');
    const button=target.querySelector('[data-business-ai]');button.onclick=async()=>{
      if(busy)return;busy=true;button.disabled=true;
      const current=report,aiMessage=target.querySelector('[data-business-ai-message]');
      try{aiMessage.textContent='正在提交可选 AI 分析…';const {createBusinessAnalysis}=await import('../api/aiAnalysis.js');
        const result=await createBusinessAnalysis({requestKey:crypto.randomUUID(),title:current.title.slice(0,190)+' · AI建议',dateRangeStart:current.period.start,dateRangeEnd:current.period.end,
          businessScope:current.business.scope,focusGoal:current.focusGoal,userQuestion:current.business.question,evidenceReportId:current.id});
        if(token===generation&&selected===current.id)aiMessage.textContent='AI任务已提交，可在 AI 历史查看。任务编号：'+result.jobId;
      }catch(error){if(token===generation&&selected===current.id)aiMessage.textContent='AI 未就绪：'+error.message+'。业务报告和人工操作仍可使用。';}
      finally{busy=false;if(button.isConnected)button.disabled=false;}
    };
  }
  async function draw(){
    ctx.clear?.();
    const token=++generation,host=$('#as-output');
    host.innerHTML=`<div class="si-page business-analysis-page"><section class="a-card"><h1>业务优先级与人工判断</h1><p>指标、证据、规则排序、人工行动与前后数据独立运行。查看和生成业务报告不会调用 AI。</p>
      <form data-business-form><label>报告标题<input name="title" required maxlength="200" value="${esc(filters.title)}"></label><label>开始日期 · UTC+7<input name="start" type="date" required value="${filters.start}"></label><label>结束日期（含当日）<input name="end" type="date" required value="${filters.end}"></label><label>来源<input name="source" maxlength="200" value="${esc(filters.source)}"></label><label>业务目标<select name="goal">${[['activation','提升激活'],['retention','提升留存'],['conversion','提升转化'],['revenue','收入策略']].map(([v,l])=>`<option value="${v}" ${filters.goal===v?'selected':''}>${l}</option>`).join('')}</select></label><label>业务背景、目标与资源限制<textarea name="question" maxlength="5000">${esc(filters.question)}</textarea></label><button class="a-button" ${busy?'disabled':''}>生成业务报告（不调用 AI）</button></form><p>支持最多31天、来源范围。规则分只用于核查顺序，人工可另定优先级。</p><p role="status" data-business-message></p></section>
      <section class="a-card"><h2>已保存业务报告</h2><div data-business-history>正在读取历史报告…</div></section><div data-business-report></div></div>`;
    host.querySelector('[data-business-form]').onsubmit=async e=>{
      e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;
      const f=new FormData(e.target);for(const key of Object.keys(filters))filters[key]=String(f.get(key)||'');
      try{message('正在读取业务数据并计算规则，不调用模型…');const result=await createBusinessReport({title:filters.title,start:Date.parse(filters.start+'T00:00:00+07:00'),end:Date.parse(filters.end+'T00:00:00+07:00')+DAY,businessScope:{source:filters.source.trim()||'all'},focusGoal:filters.goal,question:filters.question});
        if(token!==generation)return;selected=result.id;await draw();
      }catch(error){if(token===generation)message(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;const current=node('[data-business-form] button');if(current)current.disabled=false;}
    };
    try{const list=await listBusinessReports();if(token!==generation)return;
      const history=node('[data-business-history]');history.innerHTML=list.reports.map(r=>`<p><button class="a-button" data-business-id="${esc(r.id)}">${esc(r.title)}</button> · ${esc(local(r.created_at))}</p>`).join('')||'<p>尚无业务报告。先生成报告，也可一直不用 AI。</p>';
      history.querySelectorAll('[data-business-id]').forEach(b=>b.onclick=async()=>{selected=b.dataset.businessId;try{await show(selected,token);}catch(error){if(token===generation)message(error.message);}});
      if(selected)await show(selected,token);
    }catch(error){if(token===generation)message('业务历史读取失败：'+error.message+'。你仍可以尝试生成新报告。');}
  }
  return {draw,dispose};
}
