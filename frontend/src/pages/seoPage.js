import './aiAnalysis.css';
import './seoReport.css';
import {queueAnalysisLaunch} from '../analysisLaunchContext.js';
import {renderSeoReport,applySeoQueryFilter,safeSeoUrl} from './seoReportView.js';
import {loadingState} from './loadingState.js';
import {getSeoImports,importSeoSnapshot,previewSeoSnapshot,getGscConnection,saveGscSite,syncGscPerformance,getGscPerformance,getGscSitemaps,inspectGscUrl,beginGscOAuth,disconnectGscOAuth} from '../api/aiAnalysis.js';

const DAY=86400000, OFFSET=7*3600000;
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);

/** SEO evidence and explicitly requested Google sync; never starts paid AI work. */
export function createSeoPage(ctx){
 const {$,esc}=ctx;
 let generation=0,busy=false,notice='',syncNotice='',oauthListener=null,oauthTimer=null;
 const backendOrigin=new URL(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001').origin;
 const gscDates={start:new Date(Date.now()-30*DAY).toISOString().slice(0,10),end:new Date(Date.now()-3*DAY).toISOString().slice(0,10)};
 const formatCount=v=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:0});
 const formatPercent=v=>v==null?'—':(100*Number(v)).toFixed(2)+'%';
 const formatPosition=v=>v==null?'—':Number(v).toFixed(1);
 const message=value=>{notice=String(value);const node=$('#as-output')?.querySelector('[data-seo-message]');if(node)node.textContent=notice};
 function clearOAuthWatch(){
  if(oauthListener)window.removeEventListener('message',oauthListener);
  if(oauthTimer)clearInterval(oauthTimer);
  oauthListener=null;oauthTimer=null;
 }
 function dispose(){generation++;clearOAuthWatch()}
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
    <header class="ai-decision-hero"><div><span class="ai-eyebrow">CHANNEL INTELLIGENCE</span><h1>SEO 分析</h1><p>搜索曝光、关键词、页面与收录状态；同步本身不调用 AI。</p></div><div class="seo-page-actions"><button class="a-button" data-seo-refresh type="button">刷新</button><button class="a-button a-primary" data-seo-agent type="button" ${!gscSnapshot.available||!gscSnapshot.report?'disabled':''}>交给 AI 分析</button></div></header>
    <p data-seo-message role="status" aria-live="polite">${esc(notice)}</p>
        <details class="a-card ai-gsc-settings seo-settings" ${(!gscConnection.selectedSite||!gscSnapshot.available)?'open':''}>
          <summary>数据源设置 <span>${gscConnection.selectedSite?'已连接 · '+esc(gscConnection.selectedSite):'需要配置'}</span></summary>
          <h2>Google Search Console · 网站与数据设置</h2>
          <p>只读 Search Console API。Google 授权凭据仅保存在服务器端，网页不会上传或显示密钥／Token。</p>
          <p role="status">
            ${gscConnection.configured?
              (gscConnection.selectedSite?'已连接 · 站点已选定':'API 已配置 · 请选择可访问站点'):
              '尚未完成此账号的 API 授权配置'}
            ${gscConnection.mode&&gscConnection.configured?' · '+esc(gscConnection.mode):''}
          </p>
          ${gscConnection.oauthAvailable?`<div class="ai-gsc-controls">
            <button class="a-button" type="button" data-gsc-oauth-connect>${gscConnection.oauthConnected?'重新授权 Google':'连接 Google Search Console'}</button>
            ${gscConnection.oauthConnected?'<button class="a-button" type="button" data-gsc-oauth-disconnect>断开 Google 连接</button>':''}
            <span>登录 Google 后授权只读 SEO 数据；授权后可由已启用的每日 Worker 自动同步。</span>
          </div>`:'<p>Google 登录连接未启用，请先在后端配置 OAuth 客户端。</p>'}
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
          <p data-gsc-sync-status role="status" aria-live="polite">${esc(syncNotice)}</p>
          <p>同步采用已最终确定的 Google 搜索数据；不会发起 AI 调查，也不会修改网站、索引或 Sitemap 设置。</p>
        </details>
        <section class="a-card ai-gsc-report">
          <h2>自然搜索表现</h2>
          ${gscSnapshot.error?'<p role="status">历史同步数据暂不可用：'+esc(gscSnapshot.error)+'</p>':''}
          ${gscSnapshot.available&&gscSnapshot.report?renderSeoReport(gscSnapshot.report,esc):
           '<p>暂无已同步的 Google Search Console 报告。请展开上方数据源设置连接并同步。</p>'}
         </section>
         <details class="a-card ai-gsc-diagnostics seo-settings">
          <summary>Sitemap 与 URL 收录检查</summary>
          <p>只读查看 Search Console 中已经提交的 Sitemap 和某个 URL 的 Google 索引版本；不提交 Sitemap，不请求收录，也不更改网站。</p>
          <button class="a-button" data-gsc-sitemaps ${!gscConnection.selectedSite?'disabled':''}>查看已提交 Sitemap</button>
          <form data-gsc-inspect-form class="ai-gsc-controls">
            <label>检查页面 URL（必须属于已选择资源的 HTTPS 页面）
              <input name="inspectionUrl" type="url" placeholder="https://example.com/holders" maxlength="1500" required></label>
            <button type="submit" class="a-button" ${!gscConnection.selectedSite?'disabled':''}>查看 Google 索引状态</button>
          </form>
          <div data-gsc-diagnostic-result role="status">尚未发起索引状态查询。</div>
        </details>
        <details class="a-card seo-settings"><summary>备用手动导入与历史证据</summary>
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
          <div class="seo-preview" data-specialist-preview><p>选择 SEO 快照查看已保存的业务证据。</p></div>
        </details>
    </div>`;
   host.querySelector('[data-seo-refresh]').onclick=draw;
   host.querySelector('[data-seo-agent]')?.addEventListener('click',()=>{
     if(!gscSnapshot.available||!gscSnapshot.report)return;
     const report=gscSnapshot.report;
     queueAnalysisLaunch({kind:'seo',site:String(report.siteUrl||gscConnection.selectedSite||'').slice(0,500),
       start:String(report.startDate||'').slice(0,12),end:String(report.endDate||'').slice(0,12)});
     ctx.navigate('ai-analysis');
   });
   applySeoQueryFilter(host);
       const oauthConnect=host.querySelector('[data-gsc-oauth-connect]');
       if(oauthConnect)oauthConnect.onclick=async()=>{
         if(busy)return;
         const popup=window.open('about:blank','logearn-gsc-oauth','width=520,height=680');
         if(!popup){message('浏览器拦截了 Google 授权窗口，请允许弹窗后重试');return}
         busy=true;oauthConnect.disabled=true;
         try{
           const {authorizationUrl}=await beginGscOAuth();
           if(new URL(authorizationUrl).origin!=='https://accounts.google.com')
             throw Error('Google 授权地址无效');
           clearOAuthWatch();
           oauthListener=event=>{
             if(event.origin!==backendOrigin||event.data?.type!=='logearn:gsc:oauth')return;
             clearOAuthWatch();
             if(event.data.status==='connected'){
               message('Google Search Console 授权成功，请选择站点');
               void draw();
             }else message('Google 授权未完成，请重试');
           };
           window.addEventListener('message',oauthListener);
           popup.location.replace(authorizationUrl);
           // Some browsers isolate the OAuth popup; a closed popup can still be verified server-side.
           oauthTimer=setInterval(async()=>{
             if(!popup.closed||token!==generation)return;
             clearOAuthWatch();
             try{
               const state=await getGscConnection();
               if(state.oauthConnected&&!gscConnection.oauthConnected){message('Google 授权成功');await draw()}
               else if(gscConnection.oauthConnected)message('可点击刷新检查 Google 重新授权状态');
               else message('Google 授权未完成，请重试');
             }catch(error){message('授权状态检查失败：'+error.message)}
           },1500);
         }catch(error){
           popup.close();message('无法启动 Google 授权：'+error.message);
         }finally{busy=false;if(oauthConnect.isConnected)oauthConnect.disabled=false}
       };
       const oauthDisconnect=host.querySelector('[data-gsc-oauth-disconnect]');
       if(oauthDisconnect)oauthDisconnect.onclick=async()=>{
         if(busy||!window.confirm('断开此后台的 Google Search Console 连接？已保存的历史 SEO 数据将保留。'))return;
         busy=true;oauthDisconnect.disabled=true;
         try{await disconnectGscOAuth();message('Google 连接已从本后台断开');await draw()}
         catch(error){message('断开失败：'+error.message)}
         finally{busy=false;if(oauthDisconnect.isConnected)oauthDisconnect.disabled=false}
       };
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
        const syncStatus=host.querySelector('[data-gsc-sync-status]');
        syncNotice='正在读取并校验 Google 搜索数据…';
        if(syncStatus)syncStatus.textContent=syncNotice;
        try{
          const synced=await syncGscPerformance(startDate,endDate);
          gscDates.start=startDate;gscDates.end=endDate;
          if(token===generation){
            syncNotice=synced.cached?'已读取最近同步的 Search Console 快照':'Google Search Console 已同步最终数据';
            message(syncNotice);
            await draw();
          }
        }catch(error){if(token===generation){
          syncNotice='Search Console 同步失败：'+error.message;
          if(syncStatus)syncStatus.textContent=syncNotice;
          message(syncNotice);
        }}
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
             <p>页面：${esc(safeSeoUrl(r.inspectionUrl||url).label)}</p>
             <p>索引覆盖：${esc(r.coverageState||'未知')} · 结果：${esc(r.verdict||'未知')}</p>
             <p>抓取状态：${esc(r.pageFetchState||'未知')} · 最近抓取：${esc(r.lastCrawlTime||'未知')}</p>
             <p>robots.txt：${esc(r.robotsTxtState||'未知')} · 索引允许：${esc(r.indexingState||'未知')}</p>
             <p>Google 规范页面：${esc(r.googleCanonical?safeSeoUrl(r.googleCanonical).label:'未知')}</p>
             <p>网站声明的规范页面：${esc(r.userCanonical?safeSeoUrl(r.userCanonical).label:'未知')}</p>
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
          const safeReport=JSON.stringify(result.report,(key,value)=>key==='page'&&typeof value==='string'?safeSeoUrl(value).label:value,2);
          specialist.innerHTML='<h3>SEO 已导入观察数据（URL 参数值已遮蔽）</h3><pre>'+esc(safeReport)+'</pre>';
        }catch(error){if(token===generation)specialist.textContent=error.message}
        finally{if(button.isConnected)button.disabled=false}
      });
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
  }catch(error){
   if(token===generation){
    host.innerHTML=`<section class="a-card"><p role="alert">${esc(error.message)}</p><button class="a-button" data-seo-refresh>重试</button></section>`;
    host.querySelector('[data-seo-refresh]').onclick=draw;
   }
  }
 }
 return {draw,dispose};
}
