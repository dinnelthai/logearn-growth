import './aiAnalysis.css';
import {loadingState} from './loadingState.js';
import {getSeoImports,importSeoSnapshot,previewSeoSnapshot,getGscConnection,saveGscSite,syncGscPerformance,getGscPerformance,getGscSitemaps,inspectGscUrl} from '../api/aiAnalysis.js';

const DAY=86400000, OFFSET=7*3600000;
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);

/** SEO evidence and explicitly requested Google sync; never starts paid AI work. */
export function createSeoPage(ctx){
 const {$,esc}=ctx;
 let generation=0,busy=false,notice='';
 const gscDates={start:new Date(Date.now()-30*DAY).toISOString().slice(0,10),end:new Date(Date.now()-3*DAY).toISOString().slice(0,10)};
 const formatCount=v=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:0});
 const formatPercent=v=>v==null?'—':(100*Number(v)).toFixed(2)+'%';
 const formatPosition=v=>v==null?'—':Number(v).toFixed(1);
 const message=value=>{notice=String(value);const node=$('#as-output')?.querySelector('[data-seo-message]');if(node)node.textContent=notice};
 function dispose(){generation++}
 async function draw(){
  ctx.clear?.();
  const token=++generation,host=$('#as-output');
  host.innerHTML=loadingState('正在读取 Search Console 与 SEO 数据…');
  try{
   const [seoData,gscConnection,gscSnapshot]=await Promise.all([
    getSeoImports().catch(error=>({imports:[],error:error.message})),
    getGscConnection().catch(error=>({sites:[],configured:false,error:error.message})),
    getGscPerformance().catch(error=>({available:false,error:error.message}))
   ]);
   if(token!==generation)return;
   host.innerHTML=`<div class="si-page ai-analysis-page seo-workspace">
    <header class="ai-decision-hero"><div><span class="ai-eyebrow">CHANNEL INTELLIGENCE</span><h1>SEO 分析</h1><p>搜索曝光、关键词、页面与收录状态；同步本身不调用 AI。</p></div><button class="a-button" data-seo-refresh type="button">刷新</button></header>
    <p data-seo-message role="status" aria-live="polite">${esc(notice)}</p>
        <section class="a-card ai-gsc-settings">
          <h2>Google Search Console · 网站与数据设置</h2>
          <p>只读 Search Console API。凭证保存在服务器环境，网页不会上传或显示 Google 私钥／Token。</p>
          <p role="status">
            ${gscConnection.configured?
              (gscConnection.selectedSite?'已连接 · 站点已选定':'API 已配置 · 请选择可访问站点'):
              '尚未完成此账号的 API 授权配置'}
            ${gscConnection.mode&&gscConnection.configured?' · '+esc(gscConnection.mode):''}
          </p>
          ${gscConnection.error?'<p role="alert">连接检查失败：'+esc(gscConnection.error)+'</p>':''}
          ${gscConnection.reason?'<p>'+esc(gscConnection.reason)+'</p>':''}
          ${gscConnection.selectionNeedsReview?'<p role="alert">此前站点已失去 API 权限，请重新选择。</p>':''}
          <div class="ai-gsc-controls">
            <label>Search Console 资源
              <select data-gsc-site ${!(gscConnection.sites||[]).length?'disabled':''}>
                ${(gscConnection.sites||[]).length?(gscConnection.sites||[]).map(site=>
                  `<option value="${esc(site.siteUrl)}" ${site.siteUrl===gscConnection.selectedSite?'selected':''}>${esc(site.siteUrl)} · ${esc(site.permissionLevel)}</option>`).join(''):
                  '<option value="">没有可访问的 Google 站点</option>'}
              </select>
            </label>
            <button class="a-button" type="button" data-gsc-save ${!(gscConnection.sites||[]).length?'disabled':''}>保存默认站点</button>
          </div>
          <form data-gsc-sync-form class="ai-gsc-controls">
            <label>数据开始日期（Search Console 太平洋时间）
              <input type="date" name="startDate" required value="${esc(gscDates.start)}"></label>
            <label>结束日期（仅最终数据，至少早于今天2天）
              <input type="date" name="endDate" required value="${esc(gscDates.end)}"></label>
            <button type="submit" class="a-button" ${!gscConnection.selectedSite?'disabled':''}>从 Google 同步数据</button>
          </form>
          <p>同步采用已最终确定的 Google 搜索数据；不会发起 AI 调查，也不会修改网站、索引或 Sitemap 设置。</p>
        </section>
        <section class="a-card ai-gsc-report">
          <h2>Search Console · SEO 数据面板</h2>
          ${gscSnapshot.error?'<p role="status">历史同步数据暂不可用：'+esc(gscSnapshot.error)+'</p>':''}
          ${gscSnapshot.available&&gscSnapshot.report?(()=>{
            const r=gscSnapshot.report,metric=r.metrics||{},coverage=r.coverage||{};
            return `<p>资源：${esc(r.siteUrl)} · 报告期 ${esc(r.startDate)} ~ ${esc(r.endDate)} · 上次同步 ${esc(r.syncedAt?new Date(r.syncedAt).toLocaleString('zh-CN'):'—')}</p>
              <div class="ai-stats-grid">
                <div class="ai-stat"><span>总点击</span><strong>${esc(formatCount(metric.clicks))}</strong></div>
                <div class="ai-stat"><span>总曝光</span><strong>${esc(formatCount(metric.impressions))}</strong></div>
                <div class="ai-stat"><span>站点 CTR</span><strong>${esc(formatPercent(metric.ctr))}</strong></div>
                <div class="ai-stat"><span>平均排名</span><strong>${esc(formatPosition(metric.position))}</strong></div>
              </div>
              <p>数据覆盖：${esc(coverage.reportedDays)} / ${esc(coverage.expectedDays)} 个日期；
                查询行 ${esc(coverage.queryRowsReturned)}；页面行 ${esc(coverage.pageRowsReturned)}。</p>
              <h3>按日走势</h3>
              <div class="ai-gsc-table"><table><thead><tr><th>日期</th><th>点击</th><th>曝光</th><th>CTR</th><th>排名</th></tr></thead>
                <tbody>${(r.daily||[]).map(d=>`<tr><td>${esc(d.date)}</td><td>${esc(formatCount(d.clicks))}</td><td>${esc(formatCount(d.impressions))}</td><td>${esc(formatPercent(d.ctr))}</td><td>${esc(formatPosition(d.position))}</td></tr>`).join('')||'<tr><td colspan="5">暂无按日数据，不能判定为零流量</td></tr>'}</tbody></table></div>
              <h3>热门关键词（前 30）</h3>
              <div class="ai-gsc-table"><table><thead><tr><th>查询词</th><th>点击</th><th>曝光</th><th>CTR</th><th>排名</th></tr></thead>
                <tbody>${(r.queries||[]).slice(0,30).map(q=>`<tr><td>${esc(q.query)}</td><td>${esc(formatCount(q.clicks))}</td><td>${esc(formatCount(q.impressions))}</td><td>${esc(formatPercent(q.ctr))}</td><td>${esc(formatPosition(q.position))}</td></tr>`).join('')||'<tr><td colspan="5">无可展示的查询词</td></tr>'}</tbody></table></div>
              <h3>潜在 SEO 机会（候选，非预测收益）</h3>
              ${(r.opportunities||[]).slice(0,12).map(q=>`<p>${esc(q.query)} · 曝光 ${esc(formatCount(q.impressions))} · CTR ${esc(formatPercent(q.ctr))} · 平均排名 ${esc(formatPosition(q.position))}</p>`).join('')||'<p>本次数据中没有达到候选阈值的查询词。</p>'}
              <h3>热门页面（前 20）</h3>
              <div class="ai-gsc-table"><table><thead><tr><th>页面</th><th>点击</th><th>曝光</th><th>CTR</th></tr></thead>
                <tbody>${(r.pages||[]).slice(0,20).map(p=>`<tr><td>${esc(p.page)}</td><td>${esc(formatCount(p.clicks))}</td><td>${esc(formatCount(p.impressions))}</td><td>${esc(formatPercent(p.ctr))}</td></tr>`).join('')||'<tr><td colspan="4">无可展示的页面</td></tr>'}</tbody></table></div>
              <p>${(r.warnings||[]).map(w=>esc(w)).join('；')}</p>`;
          })():'<p>尚无已同步的 Google API 数据。选择站点后点击同步，才能展示可核查的关键词及趋势。</p>'}
        </section>
        <section class="a-card ai-gsc-diagnostics">
          <h2>Sitemap 与 URL 收录检查</h2>
          <p>只读查看 Search Console 中已经提交的 Sitemap 和某个 URL 的 Google 索引版本；不提交 Sitemap，不请求收录，也不更改网站。</p>
          <button class="a-button" data-gsc-sitemaps ${!gscConnection.selectedSite?'disabled':''}>查看已提交 Sitemap</button>
          <form data-gsc-inspect-form class="ai-gsc-controls">
            <label>检查页面 URL（必须属于已选择资源的 HTTPS 页面）
              <input name="inspectionUrl" type="url" placeholder="https://example.com/holders" maxlength="1500" required></label>
            <button type="submit" class="a-button" ${!gscConnection.selectedSite?'disabled':''}>查看 Google 索引状态</button>
          </form>
          <div data-gsc-diagnostic-result role="status">尚未发起索引状态查询。</div>
        </section>
        <section class="a-card"><h2>SEO · 备用手动导入</h2>
          <p>优先使用上方 Google API 同步。只有服务器尚不能读取该资源时，才使用以下离线 GSC JSON 作为有限证据。</p>
          ${seoData.error?'<p role="status">SEO 数据暂不可用：'+esc(seoData.error)+'</p>':''}
          <form data-seo-import-form>
           <label>粘贴规范化的 GSC JSON（siteUrl、startDate、endDate、source、rows）
             <textarea name="json" rows="4" maxlength="95000" placeholder='{"siteUrl":"https://example.com/","startDate":"2026-10-18","endDate":"2026-10-18","source":"gsc-manual-export","rows":[{"date":"2026-10-18","query":"holder distribution","page":"https://example.com/holders","clicks":2,"impressions":80,"position":8.2}]}'
             required></textarea></label>
           <button class="a-button" type="submit">导入 GSC 快照（不调用 AI）</button>
          </form>
          ${(seoData.imports||[]).slice(0,10).map(r=>`<p>${esc(r.site_url)} ·
             ${esc(r.start_date)} ~ ${esc(r.end_date)} · ${esc(r.row_count)} 行
             <button class="a-button" data-seo-preview="${esc(r.id)}">查看 SEO 证据</button></p>`).join('')||'<p>暂无 Search Console 数据，关键词搜索量与排名不可用。</p>'}
        </section>

    <section class="a-card" data-specialist-preview><p>选择 SEO 快照查看已保存的业务证据。</p></section>
    </div>`;
   host.querySelector('[data-seo-refresh]').onclick=draw;
       const gscSave=host.querySelector('[data-gsc-save]');
      if(gscSave)gscSave.onclick=async()=>{
        const value=host.querySelector('[data-gsc-site]')?.value;
        if(busy||!value)return;busy=true;gscSave.disabled=true;
        try{
          await saveGscSite(value);
          if(token===generation){message('Search Console 默认站点已保存');await draw()}
        }catch(error){if(token===generation)message('保存站点失败：'+error.message)}
        finally{busy=false;if(gscSave.isConnected)gscSave.disabled=false}
      };
      const gscSyncForm=host.querySelector('[data-gsc-sync-form]');
      if(gscSyncForm)gscSyncForm.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        const form=new FormData(e.target),startDate=String(form.get('startDate')||''),
          endDate=String(form.get('endDate')||'');
        try{
          const synced=await syncGscPerformance(startDate,endDate);
          gscDates.start=startDate;gscDates.end=endDate;
          if(token===generation){
            message(synced.cached?'已读取最近同步的 Search Console 快照':'Google Search Console 已同步最终数据');
            await draw();
          }
        }catch(error){if(token===generation)message('Search Console 同步失败：'+error.message)}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      const gscDiagnostics=host.querySelector('[data-gsc-diagnostic-result]');
      const sitemapButton=host.querySelector('[data-gsc-sitemaps]');
      if(sitemapButton)sitemapButton.onclick=async()=>{
        if(busy||!gscDiagnostics)return;busy=true;sitemapButton.disabled=true;
        gscDiagnostics.textContent='正在读取 Google Sitemap 状态…';
        try{
          const result=await getGscSitemaps();
          if(token!==generation)return;
          gscDiagnostics.innerHTML='<h3>已提交 Sitemap（最多50条）</h3>'+
            ((result.rows||[]).map(r=>`<p>${esc(r.path)} ·
              错误 ${esc(r.errors??'未知')} · 警告 ${esc(r.warnings??'未知')} ·
              最近下载 ${esc(r.lastDownloaded||'未知')}${r.isPending?' · 待处理':''}</p>`).join('')||
             '<p>该 Search Console 资源没有返回已提交的 Sitemap。</p>')+
            '<p>提交和索引计数不等于整站页面覆盖率。</p>';
        }catch(error){if(token===generation)gscDiagnostics.textContent='Sitemap 查询失败：'+error.message}
        finally{busy=false;if(sitemapButton.isConnected)sitemapButton.disabled=false}
      };
      const inspectForm=host.querySelector('[data-gsc-inspect-form]');
      if(inspectForm)inspectForm.onsubmit=async e=>{
        e.preventDefault();if(busy||!gscDiagnostics)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        const url=String(new FormData(e.target).get('inspectionUrl')||'');
        gscDiagnostics.textContent='正在查询 Google 已索引版本…';
        try{
          const response=await inspectGscUrl(url);
          if(token!==generation)return;
          const r=response.result||{};
          gscDiagnostics.innerHTML=`<h3>Google URL 索引信息</h3>
             <p>页面：${esc(r.inspectionUrl||url)}</p>
             <p>索引覆盖：${esc(r.coverageState||'未知')} · 结果：${esc(r.verdict||'未知')}</p>
             <p>抓取状态：${esc(r.pageFetchState||'未知')} · 最近抓取：${esc(r.lastCrawlTime||'未知')}</p>
             <p>robots.txt：${esc(r.robotsTxtState||'未知')} · 索引允许：${esc(r.indexingState||'未知')}</p>
             <p>Google 规范页面：${esc(r.googleCanonical||'未知')}</p>
             <p>网站声明的规范页面：${esc(r.userCanonical||'未知')}</p>
             <p>${esc(r.warning||'仅查询 Google 索引中的已有状态')}</p>`;
        }catch(error){if(token===generation)gscDiagnostics.textContent='网址检查失败：'+error.message}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      const specialist=host.querySelector('[data-specialist-preview]');
      host.querySelectorAll('[data-seo-preview]').forEach(button=>button.onclick=async()=>{
        if(!specialist)return;
        button.disabled=true;specialist.textContent='正在查询 Search Console 快照…';
        try{
          const result=await previewSeoSnapshot(button.dataset.seoPreview);
          if(token!==generation)return;
          specialist.innerHTML='<h3>SEO 已导入观察数据</h3><pre>'+esc(JSON.stringify(result.report,null,2))+'</pre>';
        }catch(error){if(token===generation)specialist.textContent=error.message}
        finally{if(button.isConnected)button.disabled=false}
      });
      const kolButton=host.querySelector('[data-kol-preview]');
      if(kolButton)kolButton.onclick=async()=>{
        if(!specialist)return;
        kolButton.disabled=true;specialist.textContent='正在查询已归组 KOL 观察数据…';
        try{
          const result=await previewKolPerformance(timestamp(defaults.start),
            timestamp(defaults.end)+DAY);
          if(token!==generation)return;
          specialist.innerHTML='<h3>KOL 观察数据（非因果）</h3><pre>'+esc(JSON.stringify(result.report,null,2))+'</pre>';
        }catch(error){if(token===generation)specialist.textContent=error.message}
        finally{if(kolButton.isConnected)kolButton.disabled=false}
      };
      const importForm=host.querySelector('[data-seo-import-form]');
      if(importForm)importForm.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        try{
          const raw=new FormData(e.target).get('json');
          const result=await importSeoSnapshot(JSON.parse(raw));
          if(token===generation){message(result.created?'SEO 快照导入成功':'相同快照已存在，未重复写入');await draw();}
        }catch(error){if(token===generation)message('导入失败：'+error.message)}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      const autonomyRefresh=host.querySelector('[data-autonomy-refresh]');
      if(autonomyRefresh)autonomyRefresh.onclick=async()=>{
        if(busy)return;busy=true;autonomyRefresh.disabled=true;
        try{
          const value=await refreshAutonomyBrief();
          if(token===generation){message('已整合历史分析和成熟复盘：'+value.status+'；本次没有付费模型请求');await draw()}
        }catch(error){if(token===generation)message('整理日报失败：'+error.message)}
        finally{busy=false;if(autonomyRefresh.isConnected)autonomyRefresh.disabled=false}
      };
      const targetForm=host.querySelector('[data-autonomy-target]');
      if(targetForm)targetForm.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        try{
          const fd=new FormData(e.target),goal=String(fd.get('goal')),
            metric=String(fd.get('metric')),value=Number(fd.get('target')),
            weight=Number(fd.get('weight'));
          const old=(agentTargets.targets||[]).find(x=>x.goal===goal&&x.metric===metric&&x.source==='all');
          await saveAutonomyTarget({goal,metric,source:'all',target:value,weight,
            expectedVersion:old?.version??null});
          if(token===generation){message('运营目标已保存；历史日报数据与目标变动需重新核对');await draw()}
        }catch(error){if(token===generation)message('保存目标失败：'+error.message)}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      host.querySelector('[href="#ai-new-analysis"]')?.addEventListener?.('click',e=>{
        e.preventDefault();
        const details=host.querySelector('#ai-new-analysis');
        if(!details)return;
        details.open=true;
        details.scrollIntoView?.({behavior:'smooth',block:'start'});
        details.querySelector?.('input[name="title"]')?.focus?.({preventScroll:true});
      });
      host.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>open(b.dataset.analysis));
      const deleteDialog=host.querySelector('.ai-delete-dialog');
      const deleteConfirm=host.querySelector('[data-delete-confirm]');
      let deleteTarget=null;
      host.querySelectorAll('[data-delete-analysis]').forEach(button=>button.onclick=()=>{
        deleteTarget=button.dataset.deleteAnalysis;
        deleteDialog.showModal();
        host.querySelector('[data-delete-cancel]').focus();
      });
      host.querySelector('[data-delete-cancel]').onclick=()=>deleteDialog.close();
      deleteConfirm.onclick=async()=>{
        const id=deleteTarget;
        if(!id||deleteConfirm.disabled)return;
        deleteConfirm.disabled=true;
        try {
          await deleteAnalysis(id);
          if(token===generation){
            const scrollY=window.scrollY;
            deleteDialog.close();
            if(selected===id)selected=null;
            message('已从历史分析中删除');await draw();
            window.scrollTo({top:scrollY,behavior:'instant'});
          }
        } catch(error){if(token===generation){deleteDialog.close();message('删除失败：'+error.message);}}
        finally{if(deleteConfirm.isConnected)deleteConfirm.disabled=false;}
      };
      const historySelect=host.querySelector('[data-ai-history-filter]');
      if(historySelect){
        historySelect.addEventListener('change',()=>{
          historyFilter=historySelect.value;
          historyPage=0;
          applyHistoryFilter();
        });
        applyHistoryFilter();
      }
      const previousPage=host.querySelector('[data-ai-history-prev]');
      const nextPage=host.querySelector('[data-ai-history-next]');
      if(previousPage)previousPage.onclick=()=>{if(historyPage>0){historyPage--;applyHistoryFilter()}};
      if(nextPage)nextPage.onclick=()=>{historyPage++;applyHistoryFilter()};
      host.querySelector('[data-ai-form]').onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;
        const form=new FormData(e.target),requestKey=crypto.randomUUID();
        defaults.start=form.get('start');defaults.end=form.get('end');
        try{
          const result=await createBusinessAnalysis({requestKey,title:form.get('title'),dateRangeStart:timestamp(defaults.start),dateRangeEnd:timestamp(defaults.end)+DAY,
            businessScope:{source:form.get('source').trim()||'all'},focusGoal:form.get('goal'),userQuestion:form.get('question'),modelMode:form.get('modelMode'),skillId:form.get('skillId')||null});
          if(token!==generation)return;
          selected=result.analysisId;historyPage=0;await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;const current=$('#as-output')?.querySelector('[data-ai-form] button');if(current)current.disabled=false;}
      };
      if(selected)await open(selected);
    }catch(error){if(token===generation)host.innerHTML=`<section class="a-card"><p>${esc(error.message)}</p><button class="a-button" data-retry>重新加载</button></section>`;host.querySelector('[data-retry]')?.addEventListener('click',draw);}
  }
  async function open(id){
    selected=id;clearTimeout(timer);
    const token=generation,request=++detailRequest;
    const loadingPanel=$('#as-output')?.querySelector('[data-detail]');
    if(loadingPanel&&displayedDetailId!==id)loadingPanel.innerHTML=loadingState('正在读取分析详情…');
    $('#as-output')?.querySelectorAll('[data-ai-history-row]').forEach(row=>{
      row.querySelector('[data-analysis]')?.setAttribute('aria-pressed',String(row.dataset.analysisId===id));
    });
    try{
      const r=await getAnalysisDetail(id);
      if(token!==generation||request!==detailRequest||selected!==id)return;
      const panel=$('#as-output').querySelector('[data-detail]');if(!panel)return;
      displayedDetailId=id;
      panel.innerHTML=`<div class="ai-detail-heading"><h2 data-detail-title>${esc(r.title)} · ${esc(label(r.status))}</h2><span data-detail-badge class="ai-state ai-state-${esc(displayTaskStatus(r).kind)}">${esc(displayTaskStatus(r).text)}</span></div>
      ${r.error_message?`<p role="alert">${esc(r.error_message)}</p>`:''}
      <p data-checkpoint-result role="status">正在读取调查检查点…</p>
      ${r.status==='failed'&&!r.cancel_requested?'<button class="a-button" data-retry-analysis disabled title="正在核对调查检查点">检查后重试</button>':''}
      ${['pending','processing'].includes(r.status)&&!r.cancel_requested?'<button class="a-button" type="button" data-cancel-analysis>取消任务</button>':''}
      ${r.cancel_requested?'<p role="status">任务已取消，不会继续新的模型调用；先前发出的请求仍可能计费。</p>':''}
      <p class="ai-detail-lead" data-detail-summary>${esc(r.result?.summary||(r.status==='failed'?'分析未完成；请查看失败原因和检查点后再决定下一步。':r.status==='processing'?'分析正在进行。':r.status==='completed'?'已完成；暂无摘要。':'任务已排队；请确认 AI Worker 正在运行。'))}</p>
      ${(r.result?.keyFindings||[]).length?`<section class="ai-findings" aria-label="关键发现"><h3>关键发现</h3><ul>${r.result.keyFindings.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></section>`:''}
      ${r.result?.routing?`<p>调查方式：${esc(r.result.routing.reason)}</p>`:''}
      <section class="ai-action-list" aria-label="人工决策与执行">
        <div class="ai-action-list-heading"><h3>行动建议</h3><span>${(r.suggestions||[]).length} 条</span></div>
        ${(r.suggestions||[]).length?(r.suggestions||[]).map(item=>renderAISuggestion(item,{esc,json,label,offset:OFFSET})).join(''):'<p class="a-muted">尚无可执行行动建议；不代表业务没有问题。</p>'}
      </section>
      <details class="ai-evidence-index"><summary>原始业务证据 · ${(r.result?.evidenceIds||[]).length} 项</summary>
        <p class="a-muted">选择证据编号查看原始指标及数据覆盖说明。</p>
        <div class="ai-evidence-links">${(r.result?.evidenceIds||[]).map(eid=>`<button class="a-button" data-evidence="${esc(eid)}">证据 ${esc(eid.slice(0,8))}</button>`).join('')}</div>
        <pre data-evidence-result></pre>
      </details>
      <details class="ai-data-appendix"><summary>业务快照、目标优先级及模型调用记录</summary><pre>${json({snapshot:r.data_snapshot,calls:r.result?.calls})}</pre></details>`;
      // Diagnostics are owner-scoped and intentionally do not expose model prompts.
      getJobCheckpoint(id).then(checkpoint=>{
        if(token!==generation||request!==detailRequest||selected!==id||!panel.isConnected)return;
        const target=panel.querySelector('[data-checkpoint-result]');
        if(!target)return;
        const reasons={
          'work-in-progress':'模型调用或调查工具正在执行，请稍候',
          'unresolved-paid-call':'模型调用状态未确认，必须人工核查，不能直接重试',
          'tool-execution-incomplete':'调查工具执行不完整，尚不允许自动续跑',
          'requires-validation-before-resume':'调查记录已保存，但尚未完成恢复验证',
          'noncontiguous-rounds':'调查步骤记录不连续，需人工核查'
        };
        const state=displayTaskStatus(r,checkpoint);
        const title=panel.querySelector('[data-detail-title]');
        if(title)title.textContent=r.title+' · '+state.text;
        const badge=panel.querySelector('[data-detail-badge]');
        if(badge){badge.textContent=state.text;badge.className='ai-state ai-state-'+state.kind;}
        const rows=[...$('#as-output').querySelectorAll('[data-ai-history-row]')];
        rows.forEach(row=>row.querySelector('[data-analysis]')?.setAttribute('aria-pressed',String(row.dataset.analysisId===id)));
        const historyRow=rows.find(el=>el.dataset.analysisId===id);
        if(historyRow){
          historyRow.dataset.aiHistoryStatus=state.kind;
          const rowBadge=historyRow.querySelector('[data-ai-history-badge]');
          if(rowBadge){rowBadge.textContent=state.text;rowBadge.className='ai-state ai-state-'+state.kind;}
        }
        applyHistoryFilter();
        if(checkpoint.requiresHumanReview){
          const summary=panel.querySelector('[data-detail-summary]');
          if(summary&&!r.result?.summary)summary.textContent='调查需要人工核查，尚未形成完整结论。请检查未完成工具和模型调用状态。';
        }
        if(!shouldPollTask(r,checkpoint)){clearTimeout(timer);timer=null;}
        const retry=panel.querySelector('[data-retry-analysis]');
        if(retry){
          const safe=canOfferTaskRetry(r,checkpoint);
          retry.disabled=!safe;
          retry.textContent=safe?'确认后重试（可能产生费用）':'暂不可安全重试';
          retry.title=safe?'请先确认已发起的模型调用和费用':'检查点状态未确认或存在未完成的模型调用';
        }
        if(canOfferTaskResume(r,checkpoint)){
          const existing=panel.querySelector('[data-resume-analysis]');
          if(!existing){
            const button=document.createElement('button');
            button.className='a-button';button.type='button';button.dataset.resumeAnalysis=id;
            button.textContent='人工确认后恢复（可能产生费用）';
            button.onclick=async()=>{
              if(busy)return;
              busy=true;button.disabled=true;
              try{
                const latest=await getJobCheckpoint(id);
                if(!canOfferTaskResume(r,latest)){
                  message('检查点已变化或无法确认恢复安全性，请先重新核查任务。');
                  return;
                }
                const confirmed=globalThis.confirm?.(
                  '这项调查有已保存的模型调用记录。恢复会再次验证已有检查点；如果后续需要新的模型轮次，可能产生费用。确定人工恢复吗？'
                );
                if(confirmed!==true)return;
                const task=await resumeAnalysis(id);
                message(task.notice||'已提交人工恢复请求；新模型调用仍可能计费。');
                if(token===generation&&selected===id)await open(id);
              }catch(error){message(error.message)}
              finally{busy=false;if(button.isConnected)button.disabled=false}
            };
            target.after(button);
          }
        }
        target.textContent=(state.kind==='attention'?'需要人工处理 · ':'调查检查点 · ')+
          (checkpoint.reason?(reasons[checkpoint.reason]||checkpoint.reason)+' · ':'')+
          '已保存模型轮次：'+(checkpoint.completedRounds??'未知')+
          ' · 工具结果：'+(checkpoint.completedTools??'未知')+
          ' · 待完成工具：'+(checkpoint.pendingTools??'未知')+
          (checkpoint.leaseExpired?' · 执行租约已过期':'')+
          (state.kind==='attention'?' · 不会自动续跑；需人工核查后操作':'');
      }).catch(error=>{
        if(token===generation&&request===detailRequest&&selected===id&&panel.isConnected){
          clearTimeout(timer);timer=null;
          const target=panel.querySelector('[data-checkpoint-result]');
          if(target)target.textContent='检查点暂不可用：'+error.message+'。已暂停自动状态刷新，请人工确认。';
          const retry=panel.querySelector('[data-retry-analysis]');
          if(retry){retry.disabled=true;retry.textContent='暂不可安全重试';}
        }
      });
      panel.querySelectorAll('[data-evidence]').forEach(button=>button.onclick=async()=>{try{const evidence=await getEvidence(button.dataset.evidence);if(token===generation&&selected===id)panel.querySelector('[data-evidence-result]').textContent=JSON.stringify(evidence,null,2);}catch(error){message(error.message);}});
      panel.querySelector('[data-cancel-analysis]')?.addEventListener('click',async e=>{
        if(busy)return;
        busy=true;const button=e.currentTarget;button.disabled=true;
        try{
          await cancelAnalysis(id);
          if(token===generation&&selected===id)await open(id);
        }catch(error){message(error.message);if(button.isConnected)button.disabled=false;}
        finally{busy=false;}
      });
      panel.querySelector('[data-retry-analysis]')?.addEventListener('click',async()=>{
        if(busy)return;
        busy=true;
        const button=panel.querySelector('[data-retry-analysis]');
        if(button)button.disabled=true;
        try{
          const latest=await getJobCheckpoint(id);
          if(!canOfferTaskRetry(r,latest)){
            message('检查点已变化或存在可能的付费调用，禁止直接重试。');
            return;
          }
          const confirmed=globalThis.confirm?.(
            '调查记录未显示已发起的模型调用；后端仍会检查共享付费账本。重试可能产生新的模型费用，确定继续吗？'
          );
          if(confirmed!==true)return;
          await retryAnalysis(id);
          if(token===generation&&selected===id)await open(id);
        }catch(error){message(error.message)}
        finally{busy=false;if(button?.isConnected)button.disabled=false}
      });
      panel.querySelectorAll('[data-suggestion]').forEach(form=>form.onsubmit=async e=>{
        e.preventDefault();
        if(busy)return;
        const state=e.submitter?.value;
        if(!['adopted','executing','executed','rejected'].includes(state))return;
        const data=new FormData(form);
        const note=String(data.get('note')||'').trim();
        const at=data.get('executedAt');
        if(state==='rejected'&&!note){
          message('请填写拒绝原因，便于之后追溯决策。');
          form.elements?.namedItem?.('note')?.focus?.();
          return;
        }
        if(state==='executed'&&!note){
          message('请记录实际执行的动作，不能只把建议标记为完成。');
          form.elements?.namedItem?.('note')?.focus?.();
          return;
        }
        const executedAt=state==='executed'&&at?Date.parse(at+':00+07:00'):undefined;
        if(at&&state==='executed'&&!Number.isFinite(executedAt)){
          message('执行时间格式无效，请核对后重试。');
          return;
        }
        busy=true;
        const buttons=[...(form.querySelectorAll?.('button')||[])];
        buttons.forEach(button=>button.disabled=true);
        try{
          await updateSuggestionStatus(form.dataset.suggestion,{
            userStatus:state,
            actualAction:state==='executed'?note:undefined,
            rejectionReason:state==='rejected'?note:undefined,
            executedAt
          });
          if(token===generation&&request===detailRequest)await open(id);
        }catch(error){message(error.message)}
        finally{
          busy=false;
          buttons.forEach(button=>{if(button.isConnected)button.disabled=false});
        }
      });
      panel.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>startReview(button.dataset.review,button,token));
       if(shouldPollTask(r))timer=setTimeout(()=>open(id),3000);
    }catch(error){
      if(token!==generation||request!==detailRequest||selected!==id)return;
      displayedDetailId=null;
      const panel=$('#as-output')?.querySelector('[data-detail]');
      if(panel){
        panel.innerHTML=viewState({kind:'error',title:'分析详情加载失败',
          description:error.message||String(error),actionLabel:'重新读取详情',actionAttr:'data-ai-detail-retry'});
        panel.querySelector?.('[data-ai-detail-retry]')?.addEventListener?.('click',()=>open(id));
      }
      message(error.message);
    }
  }
  async function startReview(suggestionId,button,token){
    if(busy||reviewPolling||!suggestionId)return;
    const accepted=globalThis.confirm?.(
      '复盘仅检查已经执行并满足观察条件的行动，可能产生新的模型费用。后端会再次校验业务数据水位和任务幂等性。确定发起吗？'
    );
    if(accepted!==true)return;
    busy=true;
    if(button)button.disabled=true;
    try{
      const response=await createRetrospective(suggestionId,crypto.randomUUID());
      if(token!==generation)return;
      if(response.status==='completed'){
        message('该建议已有已保存的复盘结果，正在重新读取记录。');
        await draw();
        return;
      }
      if(!response.jobId){
        message('服务端未返回可查询的复盘任务编号，请检查运行记录。');
        return;
      }
      message('复盘请求已入队，正在检查执行进度。');
      reviewPolling=true;
      void pollReview(response.jobId,token);
    }catch(error){
      if(token===generation)message('复盘请求未完成：'+error.message);
    }finally{
      busy=false;
      if(button?.isConnected)button.disabled=false;
    }
  }
  async function pollReview(id,token){
    if(token!==generation)return;
    try{
      const job=await getJobStatus(id);
      if(token!==generation)return;
      if(job.state==='completed'){
        reviewPolling=false;
        reviewTimer=null;
        message('复盘已完成，正在更新复盘记录。');
        await draw();
        return;
      }
      if(job.state==='failed')throw Error(job.error||'复盘失败');
      const progress=Number(job.progress);
      message('复盘状态：'+(Number.isFinite(progress)?'进度 '+Math.max(0,Math.min(100,progress))+'%':'等待执行结果')+'。可能产生模型费用。');
      reviewTimer=setTimeout(()=>pollReview(id,token),3000);
    }catch(error){
      reviewPolling=false;
      reviewTimer=null;
      if(token===generation)message('复盘状态读取失败：'+error.message+'。不会自动重新发起复盘。');
    }
  }
    return {draw,dispose};

}
  }catch(error){
   if(token===generation){
    host.innerHTML=`<section class="a-card"><p role="alert">${esc(error.message)}</p><button class="a-button" data-seo-refresh>重试</button></section>`;
    host.querySelector('[data-seo-refresh]').onclick=draw;
   }
  }
 }
 return {draw,dispose};
}
