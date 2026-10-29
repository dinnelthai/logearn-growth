import {getAnalysisDetail,getEvidence} from '../api/aiAnalysis.js';
import {queueAnalysisLaunch} from '../analysisLaunchContext.js';

const DAY=86400000;
const date=ms=>Number.isFinite(Number(ms))?new Date(Number(ms)+7*3600000).toISOString().slice(0,10):'未知';
const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未知';
const statuses={pending:'排队中',processing:'AI 正在分析',completed:'已完成',failed:'生成失败',cancelled:'已取消'};
export function mountAIWeeklyReport(root,{api,safe,navigate}){
 let disposed=false,seq=0,poll=null,selected=null,busy=false;
 const clear=()=>{if(poll){clearTimeout(poll);poll=null}};
 const links=ids=>(Array.isArray(ids)?ids:[]).map(id=>
  '<button type="button" class="a-button" data-weekly-evidence="'+safe(id)+'" title="查看来源证据">证据 '+safe(String(id).slice(0,8))+'</button>').join(' ');
 const section=(title,items,render)=>
  '<section class="ai-weekly-section"><h4>'+safe(title)+'</h4>'+
  (items?.length?'<ul>'+items.map(render).join('')+'</ul>':'<p class="a-muted">暂无经验证的内容，不能据此断定该项正常。</p>')+'</section>';
 const reportBody=(data,record)=>{
  const w=data?.result?.weeklyReport;
  if(!w)return '<p role="alert">任务已结束，但没有形成通过验证的周报正文。请到 AI 增长分析查看检查点，不应视作成功。</p>';
  return '<article class="ai-weekly-report">'+
   '<header><span class="ai-eyebrow">AI OPERATIONS WEEKLY</span><h3>'+safe(record.title||'LogEarn AI 运营周报')+'</h3>'+
   '<p class="a-muted">完整业务周 '+safe(date(record.date_range_start))+' — '+safe(date(Number(record.date_range_end)-DAY))+' · UTC+7 · 已保存的模型分析</p></header>'+
   (w.partial?'<p class="ai-weekly-partial" role="status">部分周报：模型的结构化输出不完整。以下仅整理通过证据校验的结论；请参阅数据缺口，不要把未知指标当作零。</p>':'')+
   '<section class="ai-weekly-section"><h4>执行摘要</h4><p>'+safe(w.executiveSummary)+'</p></section>'+
   '<section class="ai-weekly-section"><h4>核心指标与上周对比</h4>'+
   (w.metrics?.length?'<div class="ai-weekly-table"><table><thead><tr><th>指标</th><th>本周</th><th>上周</th><th>变化</th><th>证据</th></tr></thead><tbody>'+
    w.metrics.map(m=>'<tr><td>'+safe(m.label)+'</td><td>'+fmt(m.current)+'</td><td>'+fmt(m.previous)+'</td><td>'+(typeof m.changePct==='number'?fmt(m.changePct)+'%':'未知')+'</td><td>'+links(m.evidenceIds)+'</td></tr>').join('')+'</tbody></table></div>':
    '<p class="a-muted">缺少可验证的周度指标，不展示虚构对比。</p>')+'</section>'+
   section('本周有效进展',w.highlights,row=>'<li>'+safe(row.text)+'<div class="ai-weekly-evidence">'+links(row.evidenceIds)+'</div></li>')+
   section('核心问题与风险',w.issues,row=>'<li>'+safe(row.text)+'<div class="ai-weekly-evidence">'+links(row.evidenceIds)+'</div></li>')+
   section('渠道与获客观察',w.channelFindings,row=>'<li>'+safe(row.text)+'<div class="ai-weekly-evidence">'+links(row.evidenceIds)+'</div></li>')+
   section('下周行动计划',w.nextWeek,row=>'<li><strong>'+safe(row.priority)+' · '+safe(row.action)+'</strong>'+
    '<p>验证指标：'+safe(row.metric||'待定义')+' · 观察条件：'+safe(row.reviewCondition||'待定义')+'</p>'+
    '<div class="ai-weekly-evidence">'+links(row.evidenceIds)+'</div></li>')+
   section('数据缺口与判断边界',w.dataGaps,x=>'<li>'+safe(x)+'</li>')+
   '<details><summary>本次调查证据目录与模型记录</summary><p>证据取自归档业务统计及只读调查工具，引用必须经过服务端验证。</p>'+
   '<p>证据编号：'+safe((data.result.evidenceIds||[]).join('、')||'无')+'</p>'+
   '<p>模型：'+safe(record.model_name||'未提供')+' · 已记录费用：'+
    (record.cost_usd==null?'费率或记录尚未确认':'$'+fmt(Number(record.cost_usd)))+'</p></details>'+
   '<div data-weekly-evidence-detail class="gws-detail" hidden role="status"></div></article>';
 };
 async function showReport(row,token){
  const target=root.querySelector('[data-weekly-body]');if(!target)return;
  if(row.status!=='completed'){
   target.innerHTML='<p class="a-muted">'+(row.status==='failed'?
    '本次生成失败：'+safe(row.error_message||'原因待核查')+'。为避免重复计费，不会自动重试。':
    row.status==='cancelled'?'周报已取消。':'分析任务已保存，等待 Worker 完成。期间可能产生模型费用。')+'</p>';
   return;
  }
  try{
   const detail=await getAnalysisDetail(row.id);
   if(disposed||token!==seq)return;
   target.innerHTML=reportBody(detail,row);
   target.querySelectorAll('[data-weekly-evidence]').forEach(button=>button.addEventListener('click',async()=>{
    const out=target.querySelector('[data-weekly-evidence-detail]');
    button.disabled=true;out.hidden=false;out.textContent='正在读取归档证据…';
    try{out.textContent=JSON.stringify(await getEvidence(button.dataset.weeklyEvidence),null,2)}
    catch(error){out.textContent='读取证据失败：'+error.message}
    finally{if(button.isConnected)button.disabled=false}
   }));
  }catch(error){if(!disposed&&token===seq)target.textContent='周报详情暂不可用：'+error.message}
 }
 async function load(){
  clear();const token=++seq;
  root.innerHTML='<p class="a-muted">正在读取 AI 周报任务与历史…</p>';
  try{
   const d=await api('/ai-weekly-reports');
   if(disposed||token!==seq)return;
   const rows=Array.isArray(d.reports)?d.reports:[];
   if(!rows.some(x=>x.id===selected))selected=rows[0]?.id||null;
   const current=rows.find(x=>Number(x.date_range_start)===Number(d.period.start)&&Number(x.date_range_end)===Number(d.period.end));
   const row=rows.find(x=>x.id===selected);
   root.innerHTML='<div class="ai-weekly-heading"><div><h3>AI 运营周报</h3><p class="a-muted">最近完整周：'+
    safe(date(d.period.start))+' — '+safe(date(d.period.end-DAY))+' · UTC+7</p></div>'+
    (current?'<span class="ai-weekly-status">'+safe(row?'正在查看 · '+(statuses[row.status]||row.status):'本期 · '+(statuses[current.status]||current.status))+'</span>':
     '<button type="button" class="a-button a-primary" data-weekly-confirm>生成 AI 周报</button>')+'</div>'+
    '<p>基于已观测的业务统计生成周报，包含问题、证据与下周行动。点击「生成 AI 周报」立即提交分析任务，可能产生 Token 费用；每个完整周只创建一份，不会自动执行建议或外部操作。</p>'+
    (rows.length?'<label class="ai-weekly-picker">查看历史周报 <select data-weekly-select>'+
     rows.map(x=>'<option value="'+safe(x.id)+'" '+(x.id===selected?'selected':'')+'>'+
      safe(date(x.date_range_start))+' — '+safe(date(Number(x.date_range_end)-DAY))+' · '+
      safe(statuses[x.status]||x.status)+'</option>').join('')+'</select></label>':
     '<p class="a-muted">尚无 AI 周报。生成后在这里查看完整正文和历史版本。</p>')+
    (row?'<button type="button" class="a-button" data-weekly-inspect>查看原始 AI 调查记录、检查点与费用</button>':'')+
    '<div data-weekly-body aria-live="polite"></div><p data-weekly-note role="status"></p>';
   root.querySelector('[data-weekly-select]')?.addEventListener('change',e=>{selected=e.target.value;load()});
   root.querySelector('[data-weekly-inspect]')?.addEventListener('click',()=>{
    if(!row||typeof navigate!=='function')return;
    queueAnalysisLaunch({kind:'analysis',analysisId:row.id});
    navigate('ai-analysis');
   });
   root.querySelector('[data-weekly-confirm]')?.addEventListener('click',async event=>{
    if(busy)return;
    busy=true;
    const button=event.currentTarget;
    button.disabled=true;button.textContent='正在提交…';
    const note=root.querySelector('[data-weekly-note]');
    if(note)note.textContent='正在创建本周 AI 分析任务…';
    try{
     const result=await api('/ai-weekly-reports','POST',{});
     selected=result.analysisId;
     if(!disposed)await load();
    }catch(error){
     if(!disposed&&button.isConnected){
      button.disabled=false;button.textContent='生成 AI 周报';
      if(note)note.textContent='提交失败：'+error.message;
     }
    }finally{busy=false}
   });
   if(row)await showReport(row,token);
   if(!disposed&&token===seq&&rows.some(x=>['pending','processing'].includes(x.status))){
    poll=setTimeout(load,6000);
   }
  }catch(error){if(!disposed&&token===seq)root.innerHTML='<p role="alert">AI 周报读取失败：'+safe(error.message)+'</p><button type="button" class="a-button" data-weekly-retry>重新读取</button>';
   root.querySelector('[data-weekly-retry]')?.addEventListener('click',load)}
 }
 load();
 return ()=>{disposed=true;seq++;clear()};
}
