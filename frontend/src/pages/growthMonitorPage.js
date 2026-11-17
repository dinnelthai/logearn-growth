import './aiAnalysis.css';
import {loadingState} from './loadingState.js';
import {beginPageLoad} from './pageLoading.js';
import {getGrowthAlerts,getGrowthMonitorControl,setGrowthMonitorControl,scanGrowthAlerts,changeGrowthAlert,getGrowthBudget,getGrowthInvestigations,decideGrowthInvestigation,getGrowthNotifications,markGrowthNotificationRead,getGrowthInvestigationTimeline} from '../api/aiAnalysis.js';
import {TASK_LABELS} from './aiTaskStatus.js';

const DAY=86400000,OFFSET=7*3600000;
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);
const label=s=>TASK_LABELS[s]||s;
export function createGrowthMonitorPage(ctx){
 const {$,esc}=ctx;
 let generation=0,busy=false,notice='';
 const message=value=>{notice=String(value);const node=$('#as-output')?.querySelector('[data-monitor-message]');if(node)node.textContent=notice};
 function dispose(){generation++}
 async function draw(){
  ctx.clear?.();const token=++generation,host=$('#as-output');
  const finishLoading=beginPageLoad(host,{placeholder:loadingState('正在读取增长异常与调查提案…'),selector:'.ai-ops-monitor',message:'正在更新异常监控，旧调查结果暂时保留…'});
  try{
   const [alertData,monitorControl,proposalData,noticeData,budgetData]=await Promise.all([
    getGrowthAlerts().catch(error=>({alerts:[],error:error.message})),
    getGrowthMonitorControl().catch(error=>({allowed:false,enabled:false,error:error.message})),
    getGrowthInvestigations().catch(error=>({proposals:[],error:error.message})),
    getGrowthNotifications().catch(error=>({notifications:[],error:error.message})),
    getGrowthBudget().catch(error=>({limit:0,reservedCalls:0,remainingCalls:0,error:error.message}))
   ]);
   if(token!==generation)return;
   host.innerHTML=`<div class="si-page ai-analysis-page ai-ops-monitor">
    <header class="ai-decision-hero"><div><span class="ai-eyebrow">GROWTH OPERATIONS</span><h1>异常监控与调查</h1><p>基于既有业务证据监控风险，调查任务需要人工批准。</p></div><button class="a-button" data-monitor-refresh type="button">刷新</button></header>
    <p data-monitor-message role="status" aria-live="polite">${esc(notice)}</p><p class="a-muted">执行与跟进任务请进入 <button class="a-button" type="button" data-open-workbench>运营待办</button> 统一处理。</p>
        <section class="a-card"><h2>增长异常自动监控</h2>
          <p>自动检查拉新/激活与回访分析人数变化，不调用付费 AI，不自动执行运营动作。</p>
          ${monitorControl.error?'<p role="alert">监控开关不可用：'+esc(monitorControl.error)+'。请检查 AI 数据库迁移。</p>':''}
          <p role="status">当前设置：${monitorControl.enabled?'已启用':'关闭'} · 内置定时监控：
             ${monitorControl.workerOnline?'已加载':'未就绪'}
             ${monitorControl.enabled&&!monitorControl.workerOnline?'（已保存开启状态，但后端定时器未就绪）':''}</p>
          ${monitorControl.lastScanAt?'<p>最近扫描：'+esc(new Date(monitorControl.lastScanAt).toLocaleString('zh-CN'))+
            ' · '+esc(monitorControl.lastScanStatus||'未知')+'</p>':'<p>暂无定时扫描记录。</p>'}
          ${(monitorControl.lastScanSummary?.goals||[]).map(g=>`
            <article class="a-card">
              <strong>${esc(g.goal==='activation'?'拉新 / 激活':g.goal==='retention'?'留存':'其他')} ·
                ${esc(g.currentDay||'未取得数据')}</strong>
              <p>观测状态：${esc(g.status==='scanned'?'通过数据完整性校验':
                g.status==='coverage-unverified'?'数据覆盖尚未验证':
                g.status==='error'?'查询错误':g.status||'未知')}
                ${g.channelQuality==='truncated'?' · 渠道拆分超出限制':''}</p>
              ${(g.changes||[]).map(c=>`
                <p>${esc(c.metric)}：${esc(c.baseline)} → ${esc(c.current)}
                   （${esc(c.delta>=0?'+':'')}${esc(c.delta)}；${c.relativeChange==null?'无可比基数':esc((c.relativeChange*100).toFixed(1))+'%'}）
                   ${g.dataQuality?.complete?'':' · 仅供观察，不能确认真实下降'}</p>
                ${(c.bySource||[]).slice(0,3).map(x=>`<small>${esc(x.source)}：
                   ${esc(x.baseline)} → ${esc(x.current)}（${esc(x.delta>=0?'+':'')}${esc(x.delta)}）</small>`).join('')}
              `).join('')}
              ${g.reason?'<p>'+esc(g.reason)+'</p>':''}
            </article>`).join('')}
          ${monitorControl.allowed===false&&!monitorControl.error?'<p>此账号尚未获得监控授权，请在服务器配置允许的账号。</p>':''}
          <button class="a-button" type="button" data-monitor-toggle
            ${!monitorControl.allowed||monitorControl.error?'disabled':''}>
            ${monitorControl.enabled?'关闭自动监控':'开启自动监控'}
          </button>
          <button class="a-button" type="button" data-monitor-export
            ${!monitorControl.lastScanSummary?.history?.length?'disabled':''}>复制最近14天诊断摘要</button>
          <small>仅包含天级汇总、渠道人数变化与质量状态；不包含用户 ID、Cookie 或 API 密钥。复制后可直接发给我排查。</small>
          <p>开关保存在服务器。后台每天曼谷时间 10:30 直接读取现有增长数据，无需预先生成付费 AI 日报，也不需要额外 Worker。关闭后不再开始新的扫描，正在执行的一次可能完成。</p>
        </section>
        <section class="a-card"><h2>跨日增长告警</h2>
        <p>基于相邻完整业务日、相同目标和采集范围的已保存结果；仅提示观测变化，不宣称因果。扫描不调用 AI。</p>
        <button class="a-button" type="button" data-scan-growth-alerts>扫描已完成的每日分析</button>
        ${alertData.error?'<p role="status">告警服务暂不可用：'+esc(alertData.error)+'</p>':''}
        ${(alertData.alerts||[]).slice(0,30).map(a=>`<article>
          <p>${esc(a.priority)} · ${esc(a.metric)} · ${esc(a.direction==='decline'?'减少':'增加')} ·
          ${esc(a.source)} · 已出现 ${esc(a.occurrences)} 次 · ${esc(a.status)}</p>
          <p>上一完整日 ${esc(a.evidence?.baseline??'未知')} → 当前完整日 ${esc(a.evidence?.observed??'未知')}</p>
          ${Number(a.snooze_until)>Date.now()?'<p>已延后至 '+esc(day(Number(a.snooze_until)))+'</p>':''}
          ${a.status==='open'?'<button class="a-button" data-alert-action="acknowledge" data-alert-id="'+esc(a.id)+'" data-alert-version="'+esc(a.version)+'">确认</button>':''}
          ${a.status!=='resolved'?'<button class="a-button" data-alert-action="snooze" data-alert-id="'+esc(a.id)+'" data-alert-version="'+esc(a.version)+'">延后24小时</button><button class="a-button" data-alert-action="resolve" data-alert-id="'+esc(a.id)+'" data-alert-version="'+esc(a.version)+'">标记解决</button>':''}
          </article>`).join('')||'<p>目前没有未解决的跨日告警。</p>'}
        </section>
        <section class="a-card"><h2>待审批异常调查</h2>
        <p>每日模型调用保守额度：已预留 ${esc(budgetData.reservedCalls??0)} / ${esc(budgetData.limit??0)} 轮。额度为零时无法批准付费调查；并非美元费用上限。</p>
        ${budgetData.error?'<p role="status">额度查询暂不可用：'+esc(budgetData.error)+'</p>':''}
        ${proposalData.error?'<p role="status">提案查询暂不可用：'+esc(proposalData.error)+'</p>':''}
        ${(proposalData.proposals||[]).slice(0,30).map(p=>`<article>
          <p>${esc(p.metric)} · ${esc(p.source)} · ${esc(p.status)} · ${esc(day(Number(p.period_end)))}</p>
          <p>证据：${esc(p.diagnosis?.dataQuality?.status==='traceable-observation'?'证据期间与源端快照可追溯':'证据不完整，先核查')}。首次分析用户不等于新注册。</p>
           ${p.diagnosis?.observation?'<p>已观察：'+esc(p.diagnosis.observation.baseline)+' → '+esc(p.diagnosis.observation.current)+'；原因未知</p>':''}
           <p>调查需人工批准，可能产生模型费用；运营方案仍由负责人决定。</p>
          <button class="a-button" data-case-timeline="${esc(p.id)}">查看完整链路</button>
          ${p.analysis_id?'<button class="a-button" data-analysis="'+esc(p.analysis_id)+'">查看关联分析</button>':''}
          ${p.status==='proposed'?'<button class="a-button" data-growth-proposal="approve" data-proposal-id="'+esc(p.id)+'" data-proposal-version="'+esc(p.version)+'" '+(Number(budgetData.remainingCalls)<1?'disabled title="每日预算未开启或已耗尽"':'')+'>人工批准调查</button><button class="a-button" data-growth-proposal="dismiss" data-proposal-id="'+esc(p.id)+'" data-proposal-version="'+esc(p.version)+'">忽略提案</button>':''}
          </article>`).join('')||'<p>暂无待审批异常调查。</p>'}
        <section data-growth-timeline><p>选择提案后，可查看原始观测、调查、建议和复盘的完整关联。</p></section>
        </section>
        <section class="a-card"><h2>站内通知</h2>
        ${noticeData.error?'<p role="status">通知暂不可用：'+esc(noticeData.error)+'</p>':''}
        ${(noticeData.notifications||[]).slice(0,30).map(n=>`<p>
          ${esc(n.message)} · ${esc(day(Number(n.created_at)))}
          ${n.read_at?'（已读）':'<button class="a-button" data-notice-read="'+esc(n.id)+'">标记已读</button>'}
          </p>`).join('')||'<p>暂无站内通知。</p>'}
        <p>仅站内通知，尚未启用邮件等外部送达。</p></section>

   </div>`;
   host.querySelector('[data-monitor-refresh]').onclick=draw;
   host.querySelector('[data-open-workbench]').onclick=()=>ctx.navigate?.('workbench');
   host.querySelectorAll('[data-analysis]').forEach(button=>button.onclick=()=>ctx.navigate?.('ai-analysis'));
      const monitorToggle=host.querySelector('[data-monitor-toggle]');
      if(monitorToggle)monitorToggle.onclick=async()=>{
        if(busy)return;busy=true;monitorToggle.disabled=true;
        try{
          const result=await setGrowthMonitorControl(!monitorControl.enabled,monitorControl.version);
          if(token===generation){
            await draw();
            message(result.enabled?(result.workerOnline?'自动监控已开启':'开关已开启，等待后端定时监控就绪'):'自动监控已关闭');
          }
        }catch(error){if(token===generation)message('切换监控失败：'+error.message)}
        finally{busy=false;if(monitorToggle.isConnected)monitorToggle.disabled=false}
      };
      const exportMonitor=host.querySelector('[data-monitor-export]');
      if(exportMonitor)exportMonitor.onclick=async()=>{
        try{
          const payload={version:'growth-observations-v1',
            generatedAt:new Date().toISOString(),
            history:(monitorControl.lastScanSummary?.history||[]).map(x=>({
              day:x.day,at:x.at,status:x.status,
              goals:(x.goals||[]).map(g=>({goal:g.goal,status:g.status,
                baselineDay:g.baselineDay,currentDay:g.currentDay,baseline:g.baseline,
                current:g.current,changes:g.changes,dataQuality:g.dataQuality,
                channelQuality:g.channelQuality,reason:g.reason}))
            }))};
          await navigator.clipboard.writeText(JSON.stringify(payload,null,2));
          if(token===generation)message('已复制近14天业务观测摘要，可发送给我进一步分析。');
        }catch(error){if(token===generation)message('复制失败，请检查浏览器剪贴板权限：'+error.message)}
      };
      const scanGrowthButton=host.querySelector('[data-scan-growth-alerts]');
      if(scanGrowthButton)scanGrowthButton.onclick=async e=>{
        if(busy)return;busy=true;const button=e.currentTarget;button.disabled=true;
        try{
          const result=await scanGrowthAlerts();
          if(token===generation){message('扫描完成，新观测 '+(result.newObservations||0)+' 条');await draw();}
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      };
      host.querySelectorAll('[data-alert-action]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        const action=button.dataset.alertAction;
        try{
          await changeGrowthAlert(button.dataset.alertId,Number(button.dataset.alertVersion),action,
            action==='snooze'?{snoozeUntil:Date.now()+DAY}:{});
          if(token===generation)await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });

      host.querySelectorAll('[data-case-timeline]').forEach(button=>button.onclick=async()=>{
        const panel=host.querySelector('[data-growth-timeline]');
        if(!panel)return;
        const openedAt=token;
        button.disabled=true;
        panel.textContent='正在读取调查链路…';
        try{
          const timeline=await getGrowthInvestigationTimeline(button.dataset.caseTimeline);
          if(openedAt!==generation)return;
          const stages={
            'awaiting-approval':'等待人工批准','dismissed':'提案已忽略',
            'approved-awaiting-dispatch':'已批准，等待派发','queued':'已入队',
            'investigating':'AI 正在调查','investigation-failed':'调查失败，需核查',
            'analysis-completed-no-action':'分析已完成，无待执行建议',
            'awaiting-action-approval':'等待建议审批',
            'action-in-progress':'行动执行中','awaiting-retrospective':'等待复盘',
            'retrospective-recorded':'已有复盘记录','action-closed':'行动已关闭'
          };
          const obs=timeline.originalObservation||{};
          const diagnosis=timeline.diagnosis||{};
          panel.innerHTML=`<h3>完整调查链路 · ${esc(stages[timeline.stage]||timeline.stage)}</h3>
            <p>告警：${esc(timeline.alert.metric)} · ${esc(timeline.alert.direction)} ·
            来源 ${esc(timeline.alert.source)} · 优先级 ${esc(timeline.alert.priority)}</p>
            <p>原始观测（提案时冻结）：${esc(obs.baseline??'未知')} → ${esc(obs.observed??'未知')}
            · 变化 ${esc(obs.absolute??'未知')}；不构成因果证明。</p>
            ${diagnosis.dataQuality?.provenance?.type==='source-day-query'?
              '<p>原始源端数据截止：'+esc(diagnosis.dataQuality.provenance.cutoff)+' · 无付费 AI 日报依赖</p>':
              '<p>原始 AI 日报：'+esc(obs.evidence?.baselineAnalysisId||'未知')+' → '+
              esc(obs.evidence?.currentAnalysisId||'未知')+'</p>'}
            ${(diagnosis.channelObservation||[]).length?'<h4>来源变化（非因果归因）</h4>'+
              '<ul>'+diagnosis.channelObservation.map(x=>'<li>'+esc(x.source)+': '+
              esc(x.baseline)+' → '+esc(x.current)+' ('+
              esc(x.delta>=0?'+':'')+esc(x.delta)+')</li>').join('')+'</ul>':''}
            <p>证据状态：${esc(diagnosis.dataQuality?.status==='traceable-observation'?'可溯源观测':'需核查')}；原因未确认。</p>
            <h4>建议核查的问题（非自动运营计划）</h4>
            ${(diagnosis.investigationQuestions||[]).length?
              '<ol>'+diagnosis.investigationQuestions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ol>':
              '<p>证据不足，暂不提出原因假设；请先核对快照与时间窗口。</p>'}
            ${timeline.analysis?`<p>AI 调查：${esc(timeline.analysis.status)}
              ${timeline.analysis.error?' · '+esc(timeline.analysis.error):''}</p>
              <p>摘要：${esc(timeline.analysis.summary||'尚无分析结论')}</p>
              <p>验证证据 ID：${(timeline.analysis.evidenceIds||[]).map(esc).join('、')||'尚无'}</p>
              <button class="a-button" data-case-analysis="${esc(timeline.analysis.id)}">查看原分析与证据</button>`:
              '<p>尚未关联 AI 调查，可能还在等待审批或派发。</p>'}
            <h4>行动建议（${esc(timeline.counts.suggestions)}）</h4>
            ${(timeline.actions||[]).map(a=>`<article><p>${esc(a.priority)} · ${esc(a.problem)}
              · ${esc(label(a.status))}</p><p>建议：${esc(a.action||'无')}</p>
              ${a.actualAction?'<p>实际执行：'+esc(a.actualAction)+'</p>':''}
              </article>`).join('')||'<p>没有已保存的行动建议。</p>'}
            <h4>复盘（${esc(timeline.counts.retrospectives)}）</h4>
            ${(timeline.retrospectives||[]).map(r=>`<p>${esc(r.conclusion)} ·
              ${esc(r.confidence)} · ${r.hasCausality?'包含因果证据':'观察相关，未证明因果'}</p>`).join('')||
              '<p>尚无完成的复盘。</p>'}
            <p>本页只读取既有记录，不调用模型，也不执行运营动作。</p>`;
          panel.querySelector('[data-case-analysis]')?.addEventListener('click',()=>{
            if(timeline.analysis?.id)ctx.navigate?.('ai-analysis');
          });
        }catch(error){if(openedAt===generation)panel.textContent='无法读取调查链路：'+error.message;}
        finally{if(button.isConnected)button.disabled=false;}
      });
      host.querySelectorAll('[data-growth-proposal]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{
          const response=await decideGrowthInvestigation(button.dataset.proposalId,
            Number(button.dataset.proposalVersion),button.dataset.growthProposal);
          if(token===generation){
            message(response.note||'提案状态已更新');
            await draw();
          }
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });
      host.querySelectorAll('[data-notice-read]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{
          await markGrowthNotificationRead(button.dataset.noticeRead);
          if(token===generation)await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });

  }catch(error){
   if(token===generation)host.innerHTML=`<section class="a-card"><p role="alert">${esc(error.message)}</p><button class="a-button" data-monitor-refresh>重新读取</button></section>`;
   host.querySelector('[data-monitor-refresh]')?.addEventListener('click',draw);
  }finally{finishLoading()}
 }
 return {draw,dispose};
}
