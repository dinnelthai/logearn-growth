import {kolAccountIds,kolProfileBody} from '../analytics/kolAccounts.js'
import {mountPromotionLinks} from './promotionLinks.js'
import {inheritedReportPeriod,reportPeriod,periodFields,bindPeriod} from '../analytics/reportPeriod.js'
import {mountCollaborationPanel} from './kolCollaborations.js'
import {listKols,getKol,saveKol,fetchKolMetrics,addFollowup,linkKolActivity,unlinkKolActivity,fetchKolRanking} from '../api/crm.js'
import {performanceSummary,memberRows} from './memberPerformance.js'
import {listActivities} from '../api/activities.js'
import {observedTime} from './observedDrill.js'
import {remotePageCorrection} from '../components/remotePaging.js'
import {previewKolPerformance} from '../api/aiAnalysis.js'
const STAGES=['待联系','已联系','沟通中','试用中','合作中','暂停','已结束']
const DAY=86400000,OFFSET=25200000
export function createKolCrm(ctx) {
  const {$,esc,fmt,table}=ctx
  let reportState=inheritedReportPeriod(),promotions=null,thresholds={decline_pct:30,low_events:3,high_volume:1000}
  let epoch=0,selected=null,editing=null,draft=null,q='',stage='',assignee='',page=0,days=28,profiles=[],metrics=new Map(),metricMeta=null,detail=null
  let returnToWorkbench=false,followupDirty=false,editorDirty=false,feedback='',excludeOwn=false,collaborations=null,sort='updated_at',direction='desc',scope='tagged',view='all',rankingSnapshot=null,listVersion=null,rankingPeriod=null
  const resetRanking=()=>{rankingSnapshot=null;listVersion=null;rankingPeriod=null}
  const host=()=>$('#as-output'),time=value=>value==null?'—':observedTime(value)
  const number=value=>value==null?'—':fmt(value)
  const money=value=>value==null?'—':'$'+Number(value).toLocaleString('en-US',{maximumFractionDigits:2})
  const localTime=value=>value==null?'':new Date(value+OFFSET).toISOString().slice(0,16)
  const parseTime=value=>value?Date.parse(value+':00+07:00'):null
  const period=()=>reportPeriod({...reportState,asOf:Number(ctx.dataStore?.meta?.asOf)||Date.now()})
  const error=(node,e)=>{if(node?.isConnected)node.textContent=e.message}
  const metricCell=(m,key,group='own')=>!m?'加载中':!m[group]?(group==='own'?esc(m.reason||'待获取'):'待获取'):key==='volume_usd'?money(m[group].total[key]):number(m[group].total[key])
  function dispose(){epoch++;collaborations?.dispose();collaborations=null;promotions?.dispose();promotions=null}
  function toolbar(title,subtitle,extra='') {
    return `<header class="crm-toolbar"><div><h2>${esc(title)}</h2><p class="a-muted">${esc(subtitle)}</p></div><div class="activity-actions">${returnToWorkbench?'<button class="a-button" type="button" data-crm-return-workbench>← 返回运营待办</button>':''}${extra}${periodFields(esc,reportState,'crm')}<button class="a-button" data-crm-refresh>刷新</button></div></header>${feedback?`<p class="a-status" role="status" data-crm-feedback>${esc(feedback)}</p>`:''}`
  }
  const canDiscard=dirty=>!dirty||globalThis.confirm?.('有尚未保存的修改，确定放弃并继续吗？')===true
  function bindToolbar() {
    bindPeriod(host(),reportState,()=>{page=0;resetRanking();draw()},'crm')
    host().querySelector('[data-crm-refresh]').onclick=()=>{if(!canDiscard(followupDirty))return;followupDirty=false;resetRanking();draw()}
     const back=host().querySelector('[data-crm-return-workbench]');if(back)back.onclick=()=>ctx.navigate?.('workbench')
  }
  function coverage() {
    const failures=Object.entries(metricMeta?.errors||{}).filter(([,v])=>v).map(([k,v])=>`${{analysis:'分析',trade:'交易',referral:'推荐',account:'账号'}[k]}：${v}`).join('；')
    return `<p class="si-footnote">${metricMeta?.as_of?'数据截至 '+time(Date.parse(metricMeta.as_of))+' · UTC+7。':''}分析次数为去重后的筹码展示 / 下钻事件数，历史事件尚不能保证一次操作只计一次。成交额为已知 USD 金额，旧业务身份经验证映射；未匹配身份不纳入，覆盖不完整。未观测记录不证明没有使用。${failures?'<span class="si-error"> '+esc(failures)+'</span>':''}</p>`
  }
  async function loadMetrics(list,id) {
    try {
      const result=await fetchKolMetrics({kol_ids:list.map(p=>p.id),include_details:!!selected,...period()})
      if(id!==epoch)return false
      metricMeta=result;metrics=new Map(result.metrics.map(m=>[m.id,m]));return true
    } catch(e) {
      if(id!==epoch)return false
      metricMeta={errors:{analysis:e.message,trade:e.message,referral:e.message}}
      metrics=new Map(list.map(p=>[p.id,{available:false,reason:kolAccountIds(p).length?'数据待获取':'尚未关联账号'}]));return true
    }
  }
  function renderList(data) {
    host().innerHTML=`<div class="si-page crm-page">${toolbar('KOL CRM','按用户范围追踪使用与交易，管理合作批次、投入和复盘','<button class="a-button" type="button" data-crm-impact>查看归组观察</button><button class="a-button a-primary" data-crm-new>＋ 录入 KOL</button>')}<div data-crm-impact-result role="status"></div><div class="crm-summary"><span>共 <strong>${fmt(data.summary.total)}</strong> 个 KOL</span><span>待跟进 <strong>${fmt(data.summary.due)}</strong> 个</span></div><section class="a-card si-panel"><div class="crm-filters"><label>搜索<input data-crm-search value="${esc(q)}" placeholder="名称、平台、账号、标签"></label><label>合作阶段<select data-crm-stage><option value="">全部阶段</option>${STAGES.map(s=>`<option ${stage===s?'selected':''}>${s}</option>`).join('')}</select></label><label>负责人<select data-crm-assignee><option value="">全部负责人</option>${data.assignees.map(s=>`<option ${assignee===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label></div><div class="crm-filters"><label>统计范围<select data-crm-scope>${[['tagged','KOL 标签用户'],['own','KOL 本人'],['invited','有效直接邀请用户']].map(([v,l])=>`<option value="${v}" ${scope===v?'selected':''}>${l}</option>`).join('')}</select></label><label>关注视图<select data-crm-view>${[['all','全部'],['due','到期待跟进'],['analysed','期间有分析'],['unobserved','期间未观测分析'],['traded','期间有交易'],['analysis_no_trade','期间分析未交易'],['declining','分析使用下降'],['low_usage','低使用'],['high_value','高成交额']].map(([v,l])=>`<option value="${v}" ${view===v?'selected':''}>${l}</option>`).join('')}</select></label><label>全量排序<select data-crm-sort>${[['updated_at','档案更新时间'],['next_followup_at','下次跟进时间'],['analysis_users','分析用户数'],['analysis_events','分析次数'],['analysis_rate','分析覆盖率'],['analysis_days','分析人日'],['volume_usd','已知成交额 USD'],['transactions','交易笔数'],['last_analysis_at','最近分析']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select></label><label>顺序<select data-crm-direction><option value="desc" ${direction==='desc'?'selected':''}>降序（数值大 / 时间晚优先）</option><option value="asc" ${direction==='asc'?'selected':''}>升序（数值小 / 时间早优先）</option></select></label></div><div class="crm-filters">${[['decline_pct','下降阈值 %'],['low_events','低使用：次数少于'],['high_volume','高成交额：USD 至少']].map(([key,label])=>`<label>${label}<input type="number" min="0" data-crm-threshold="${key}" value="${thresholds[key]}"></label>`).join('')}</div><p class="a-muted">使用趋势与紧邻前一期等时长比较；上期为零或数据未知时不计算变化率。阈值按当前范围判断。</p><p class="a-muted">对全部匹配KOL排序后分页；未取得的数据排在最后。三种用户范围分别统计，可在详情展开。</p><div class="a-scroll" data-crm-table></div><div class="rf-pagination"><span>匹配 ${fmt(data.total)} 个 · 第 ${page+1}/${Math.max(1,Math.ceil(data.total/50))} 页</span><div><button class="a-button" data-crm-prev ${page?'':'disabled'}>上一页</button><button class="a-button" data-crm-next ${(page+1)*50<data.total?'':'disabled'}>下一页</button></div></div></section><div data-crm-coverage></div></div>`
    bindToolbar();
     const impactButton=host().querySelector('[data-crm-impact]');
     if(impactButton)impactButton.onclick=async()=>{
       impactButton.disabled=true;
       const resultNode=host().querySelector('[data-crm-impact-result]');
       resultNode.textContent='正在读取真实归组观察…';
       try{
         const {start,end}=period();
         const observed=await previewKolPerformance(start,end);
         resultNode.innerHTML='<details open class="a-card"><summary>KOL 归组观察（不能证明因果效果）</summary><pre>'+
           esc(JSON.stringify(observed.report,null,2))+'</pre></details>';
       }catch(error){resultNode.textContent='归组观察暂不可用：'+error.message}
       finally{if(impactButton.isConnected)impactButton.disabled=false}
     };
     host().querySelector('[data-crm-new]').onclick=()=>{editing='new';draft={stage:'待联系'};renderEditor()}
    for(const [attr,set] of [['search',v=>q=v],['stage',v=>stage=v],['assignee',v=>assignee=v],['scope',v=>scope=v],['sort',v=>sort=v],['direction',v=>direction=v],['view',v=>view=v]])host().querySelector('[data-crm-'+attr+']').onchange=e=>{set(e.target.value.trim());page=0;resetRanking();draw()}
    host().querySelector('[data-crm-prev]').onclick=()=>{page--;draw()};host().querySelector('[data-crm-next]').onclick=()=>{page++;draw()}
    host().querySelectorAll('[data-crm-threshold]').forEach(el=>el.onchange=()=>{thresholds[el.dataset.crmThreshold]=Number(el.value);page=0;resetRanking();draw()})
    renderRows()
  }
  function renderRows() {
    const node=host().querySelector('[data-crm-table]');if(!node)return
    node.innerHTML=profiles.length?table(['KOL / 平台','阶段 / 负责人','范围人数','分析人数 / 覆盖率','分析次数（观测）','分析次数变化率','分析人日','交易用户','交易笔数','已知成交额 USD','期间最近分析 · UTC+7','下次跟进 · UTC+7'],profiles.map(p=>{
      const m=p.metric,t=m?.total
      return [`<button class="a-tablelink" data-crm-open="${esc(p.id)}">${esc(p.name)} ↗</button><div class="a-muted">${esc(p.platform)}</div>`,esc(p.stage)+'<div class="a-muted">'+esc(p.assignee||'未分配')+'</div>',t?number(t.users):esc(m?.reason||'待获取'),number(t?.analysis_users)+' / '+(t?.analysis_rate==null?'—':(t.analysis_rate*100).toFixed(1)+'%'),number(t?.analysis_events),m?.trend?.analysis_change_rate==null?'—':(m.trend.analysis_change_rate*100).toFixed(1)+'%',number(t?.analysis_days),number(t?.trade_users),number(t?.transactions),money(t?.volume_usd),time(t?.last_analysis_at),time(p.next_followup_at)]
    })):'<div class="crm-empty"><h2>还没有匹配的 KOL</h2><p>可调整筛选，或录入 KOL 和标签用户。</p><button class="a-button a-primary" data-crm-empty-new>录入 KOL</button></div>'
    node.querySelectorAll('[data-crm-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.crmOpen;returnToWorkbench=false;draw()})
    const add=node.querySelector('[data-crm-empty-new]');if(add)add.onclick=()=>host().querySelector('[data-crm-new]').click()
    host().querySelector('[data-crm-coverage]').innerHTML=coverage()
  }
  function renderEditor() {
    const p=draft||{},field=(key,label,max=80,type='text')=>`<label>${label}<input name="${key}" type="${type}" maxlength="${max}" value="${esc(p[key]||'')}" ${['name','platform'].includes(key)?'required':''}></label>`
    host().innerHTML=`<div class="si-page crm-page"><header class="crm-toolbar"><div><h2>${editing==='new'?'录入 KOL':'编辑档案 · '+esc(p.name)}</h2><p class="a-muted">可关联最多20个产品账号，逐一校验；同一账号在你的CRM中只能归属一个KOL。</p></div><button class="a-button" data-crm-cancel>返回</button></header><section class="a-card si-panel"><form data-crm-profile><div class="crm-form-grid">${field('name','KOL 名称')}${field('platform','平台（如 X / Telegram / YouTube）',40)}${field('profile_url','主页链接',500,'url')}<label>关联产品账号 ID（每行一个，可稍后填写）<textarea name="account_ids" rows="4" maxlength="4000" placeholder="支持换行、逗号分隔，最多20个">${esc(kolAccountIds(p).join('\n'))}</textarea></label>${field('assignee','负责人')}${field('contact','联系方式',200)}${field('language','地区 / 语言',40)}${field('tags','KOL 分类（逗号分隔）',200)}<label>合作阶段<select name="stage">${STAGES.map(s=>`<option ${p.stage===s?'selected':''}>${s}</option>`).join('')}</select></label><label>下次跟进时间 · UTC+7<input name="next_followup" type="datetime-local" value="${localTime(p.next_followup_at)}"></label></div><label>KOL 标签用户名单（每行一个注册账号 ID）<textarea name="user_ids" rows="4" placeholder="输入后给这些用户打上该 KOL 名称标签">${esc(Array.isArray(p.user_ids)?p.user_ids.join('\n'):p.user_ids||'')}</textarea></label><p class="a-muted">关联账号也自动带有此 KOL 标签；用户分群可按标签筛选。名单与直接邀请关系分别保存。</p><label>备注<textarea name="notes" rows="4" maxlength="4000">${esc(p.notes||'')}</textarea></label><p class="si-error" data-crm-error role="alert"></p><div class="activity-actions"><button type="submit" class="a-button a-primary">保存档案</button><button type="button" class="a-button" data-crm-cancel>取消</button></div></form></section></div>`
    host().querySelectorAll('[data-crm-cancel]').forEach(b=>b.onclick=()=>{if(!canDiscard(editorDirty))return;editorDirty=false;editing=null;draft=null;draw()})
    const form=host().querySelector('form')
    const values=()=>{const value=kolProfileBody(Object.fromEntries(new FormData(form)));value.next_followup_at=parseTime(value.next_followup);delete value.next_followup;return value}
    form.oninput=()=>{editorDirty=true;draft={...p,...values()}}
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]'),node=form.querySelector('[data-crm-error]');button.disabled=true;node.textContent=''
      try {const result=await saveKol(editing==='new'?null:editing,{...values(),...(editing==='new'?{}:{expected_updated_at:p.updated_at})});if(!form.isConnected)return;selected=result.kol.id;editing=null;editorDirty=false;draft=null;feedback='KOL 档案已保存';await draw()}
      catch(err){error(node,err);button.disabled=false}
    }
  }
  function activityLinksHTML(activities){return `${activities.length?table(['活动','状态','开始 · UTC+7','截止 · UTC+7','操作'],activities.map(a=>[`<button class="a-tablelink" data-crm-activity="${esc(a.id)}">${esc(a.name)} ↗</button>`,a.schedule_state==='scheduled'?(a.start_at>Date.now()?'预约待开始':'预约待启动'):a.settled_at?'已结算':a.cutoff_at<=Date.now()?'已截止':'进行中',time(a.start_at),time(a.cutoff_at),`<button class="a-tablelink" data-crm-unlink="${esc(a.id)}">取消关联</button>`])):'<p class="a-muted">还没有关联活动。</p>'}`}
  function renderDetail() {
    followupDirty=false;const {kol:p,activities,followups}=detail,m=metrics.get(p.id),card=(label,value,note)=>`<div class="si-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`
    const own=m?.own?.total,invited=m?.invited
    host().innerHTML=`<div class="si-page crm-page">${toolbar(p.name,p.platform+' · '+p.stage+' · 负责人 '+(p.assignee||'未分配'),'<button class="a-button" data-crm-back>返回列表</button><button class="a-button" data-crm-edit>编辑档案</button>')}<section class="a-card si-panel"><div class="crm-profile"><span>关联产品账号：<strong>${kolAccountIds(p).length?kolAccountIds(p).map(esc).join('、'):'待关联'}</strong>（${kolAccountIds(p).length}个）</span><span>联系方式：${esc(p.contact||'未填写')}</span><span>地区 / 语言：${esc(p.language||'未填写')}</span><span>KOL 分类：${esc(p.tags||'未填写')}</span><span>KOL 标签用户：${fmt(new Set([...(p.user_ids||[]),...kolAccountIds(p)]).size)} 人（手动名单与全部关联账号去重）</span><span>下次跟进：${time(p.next_followup_at)}</span>${p.profile_url?`<a href="${esc(p.profile_url)}" target="_blank" rel="noopener noreferrer">查看主页 ↗</a>`:''}</div>${p.notes?`<p class="crm-note">${esc(p.notes)}</p>`:''}</section><div data-crm-promotions></div><div data-crm-collaborations></div><h2 class="crm-section-title">本人使用与交易（全部关联账号合并）</h2>${!m?'<p class="a-muted si-loading" role="status">正在读取业务指标…</p>':!m.own?`<p class="a-muted">${esc(m.reason||'本人指标待获取')}</p>`:''}<div class="crm-kpis">${card('已知成交额 USD',money(own?.volume_usd),'本人在统计期内的交易')}${card('交易笔数',number(own?.transactions),'链 + 交易哈希去重')}${card('分析次数（观测）',number(own?.analysis_events),'筹码展示 / 下钻事件去重')}${card('分析活跃人日',number(own?.analysis_days),'各关联账号活跃天数相加 · UTC+7')}</div><p class="a-muted">期间最近分析：${time(own?.last_analysis_at)}${own?.missing_values?' · '+number(own.missing_values)+' 笔交易缺金额':''}${own?.excluded_trades?' · '+number(own.excluded_trades)+' 组交易缺标识或冲突已排除':''}</p>${thisScopeActions('own',m?.own,'分析全部本人账号')}<details class="a-card si-panel"><summary>逐账号使用与交易（${fmt(m?.own?.rows?.length||0)}个已匹配账号）</summary>${m?.own?.rows?.length?memberRows(ctx,m.own.rows,0):'<p class="a-muted">暂无已匹配账号表现。</p>'}${m?.own?.unmatched_users?`<p class="a-muted">${fmt(m.own.unmatched_users)}个关联账号不在当前快照中，未纳入合并指标。</p>`:''}</details><h2 class="crm-section-title">直接邀请贡献</h2><div class="crm-kpis">${card('截至期末直接邀请人数',number(invited?.total.users),'后端有效一级绑定')}${card('本期新绑定人数',number(invited?.new_bindings),'按绑定时间统计')}${card('邀请用户分析次数（观测）',number(invited?.total.analysis_events),'统计期内且绑定后的行为')}${card('邀请用户已知成交额 USD',money(invited?.total.volume_usd),'统计期内且绑定后的交易')}</div>${m?.own&&!invited?'<p class="a-muted">推荐数据暂不可用，不能按零贡献解释。</p>':''}${thisScopeActions('invited',invited,'分析直接邀请用户')}<div data-crm-tagged></div><details class="a-card si-panel"><summary>每日本人表现</summary><div class="a-scroll">${m?.own?table(['日期 · UTC+7','分析次数（观测）','交易笔数','已知成交额 USD'],m.own.daily.map(d=>[esc(d.date),number(d.analysis_events),number(d.transactions),money(d.volume_usd)])):'<p>业务指标待获取。</p>'}</div><p class="a-muted">仅列出已观测行为日期；空日期不证明采集完整。</p></details><details class="a-card si-panel"><summary>直接邀请用户表现</summary><div data-crm-invitees></div></details><section class="a-card si-panel"><div class="crm-toolbar"><div><h2>关联活动</h2><p class="a-muted">活动名单独立固定；关联不代表所有参与者都由该 KOL 邀请。</p></div><button class="a-button" data-crm-create-activity>＋ 创建关联活动</button></div><div class="a-scroll" data-crm-linked-activities>${activityLinksHTML(activities)}</div><form class="crm-link-form" data-crm-link><label>关联已有活动<select name="activity_id" data-crm-activity-options><option value="">正在加载活动…</option></select></label><button class="a-button" type="submit" disabled>关联活动</button></form><p class="si-error" data-crm-link-error role="alert"></p></section><section class="a-card si-panel"><h2>跟进记录</h2><form data-crm-followup><label>本次跟进<textarea name="content" required maxlength="4000" rows="3" placeholder="记录沟通内容、反馈与合作进展"></textarea></label><div class="crm-form-grid"><label>下一步<input name="next_step" maxlength="1000" placeholder="下一步处理"></label><label>下次跟进时间 · UTC+7<input name="next_followup" type="datetime-local" value="${localTime(p.next_followup_at)}"></label></div><p class="si-error" role="alert" data-crm-followup-error></p><button type="submit" class="a-button a-primary">保存跟进</button></form><div class="crm-followups">${followups.length?followups.map(f=>`<article><div class="a-muted">${time(f.created_at)} · UTC+7</div><p class="crm-note">${esc(f.content)}</p>${f.next_step?`<p>下一步：${esc(f.next_step)}</p>`:''}</article>`).join(''):'<p class="a-muted">还没有跟进记录。</p>'}</div></section><details class="a-card si-panel"><summary>档案修改记录</summary>${detail.history.map(h=>{const a=JSON.parse(h.after_json),b=h.before_json?JSON.parse(h.before_json):null;const changes=b?Object.keys(a).filter(k=>k!=='updated_at'&&!(k==='account_id'&&Array.isArray(a.account_ids))&&JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>`${{account_id:'关联产品账号',account_ids:'关联产品账号',stage:'合作阶段',assignee:'负责人',next_followup_at:'下次跟进',name:'名称',platform:'平台',contact:'联系方式',tags:'标签',notes:'备注',language:'地区 / 语言',profile_url:'主页',user_ids:'标签用户名单'}[k]||k}：${k==='next_followup_at'?time(a[k]):Array.isArray(a[k])?a[k].join('、')||'清空':a[k]??'清空'}`).join('；'):'创建档案';return `<p>${time(h.created_at)} · ${esc(changes||'保存档案')}</p>`}).join('')}</details>${coverage()}</div>`
    bindToolbar();host().querySelector('[data-crm-back]').onclick=()=>{if(!canDiscard(followupDirty))return;followupDirty=false;selected=null;resetRanking();draw()};host().querySelector('[data-crm-edit]').onclick=()=>{editing=p.id;draft={...p};renderEditor()}
    host().querySelector('[data-crm-create-activity]').onclick=()=>ctx.createActivityForKol(p)
    const linkedNode=host().querySelector('[data-crm-linked-activities]')
    function bindActivityLinks(){
      linkedNode.querySelectorAll('[data-crm-activity]').forEach(b=>b.onclick=()=>ctx.openActivity(b.dataset.crmActivity))
      linkedNode.querySelectorAll('[data-crm-unlink]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await unlinkKolActivity(p.id,b.dataset.crmUnlink);if(b.isConnected){feedback='已取消活动关联';await draw()}}catch(e){error(host().querySelector('[data-crm-link-error]'),e);b.disabled=false}})
    }
    let activityOptions=[]
    const updateActivityOptions=()=>{const options=activityOptions.filter(a=>!detail.activities.some(x=>x.id===a.id));link.elements.activity_id.innerHTML='<option value="">选择活动</option>'+options.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');link.querySelector('button').disabled=!options.length}
    async function refreshActivityLinks(){const result=await getKol(p.id);if(!linkedNode.isConnected)return;detail.activities=result.activities;linkedNode.innerHTML=activityLinksHTML(result.activities);bindActivityLinks();updateActivityOptions()}
    bindActivityLinks()
    const follow=host().querySelector('[data-crm-followup]');follow.oninput=()=>{followupDirty=true};follow.onsubmit=async e=>{e.preventDefault();const button=follow.querySelector('button'),node=follow.querySelector('[data-crm-followup-error]');button.disabled=true;node.textContent=''
      try{const v=Object.fromEntries(new FormData(follow));await addFollowup(p.id,{content:v.content,next_step:v.next_step,next_followup_at:parseTime(v.next_followup)});if(follow.isConnected){followupDirty=false;feedback='跟进记录已保存';draw()}}catch(e){error(node,e);button.disabled=false}
    }
    const link=host().querySelector('[data-crm-link]');link.onsubmit=async e=>{e.preventDefault();const button=link.querySelector('button');button.disabled=true;try{if(!link.elements.activity_id.value)throw Error('请选择活动');await linkKolActivity(p.id,link.elements.activity_id.value);if(link.isConnected){feedback='活动关联已保存';await draw()}}catch(e){error(host().querySelector('[data-crm-link-error]'),e);button.disabled=false}}
    listActivities('all').then(result=>{if(!link.isConnected)return;activityOptions=result.activities;updateActivityOptions()}).catch(e=>{if(link.isConnected){link.elements.activity_id.innerHTML='<option>活动暂不可用</option>';error(host().querySelector('[data-crm-link-error]'),e)}})
    promotions?.dispose();promotions=mountPromotionLinks(host().querySelector('[data-crm-promotions]'),{kol_id:p.id},ctx);
    collaborations=mountCollaborationPanel(host().querySelector('[data-crm-collaborations]'),p,{...ctx,onActivityLinksChanged:refreshActivityLinks});
    renderInvitees(invited?.rows||[],0);renderTagged(m,p);bindScopeActions(m,p)
  }
  function thisScopeActions(scope,value,label){return `<div class="a-audience-actions"><button class="a-button" data-crm-analyse="${scope}" ${value?.rows?.length?'':'disabled'}>${label} →</button></div>`}
  function bindScopeActions(m,p){host().onclick=e=>{const b=e.target.closest('[data-user-profile]');if(b)ctx.openUserProfile?.(b.dataset.userProfile,{start:metricMeta.start,end:metricMeta.end,snapshot_id:metricMeta.snapshot_id})};host().querySelectorAll('[data-crm-analyse]').forEach(b=>b.onclick=()=>{
    const value=b.dataset.crmAnalyse==='tagged'?(excludeOwn?m.tagged_excluding_own:m.tagged):m[b.dataset.crmAnalyse]
    ctx.analyzeAudience({ids:value.rows.map(r=>'user:'+r.user_id),title:p.name+' · '+{own:'本人',invited:'直接邀请用户',tagged:'标签用户'}[b.dataset.crmAnalyse]+(b.dataset.crmAnalyse==='tagged'&&excludeOwn?'（排除本人）':''),description:b.dataset.crmAnalyse==='invited'?'固定直接邀请名单；后续通用分析展示所选期间的全部行为':'当前名单固定 · 手动标签表示成员关系',start:metricMeta.start,end:metricMeta.end,snapshot_id:metricMeta.snapshot_id,as_of:metricMeta.as_of,source:'all',origin:'crm'},'segments')
  })}
  function renderTagged(m,p,page=0){const node=host().querySelector('[data-crm-tagged]');if(!node)return
    const value=excludeOwn?m?.tagged_excluding_own:m?.tagged,rows=value?.rows||[]
    node.innerHTML=performanceSummary(ctx,value,{title:'标签用户表现',note:'手动名单 + 全部关联账号 · 名单内去重；表示这批用户的表现，三种范围可重叠。'})+`<section class="a-card si-panel"><label><input type="checkbox" data-crm-exclude-own ${excludeOwn?'checked':''}> 排除 KOL 全部本人账号</label>${!value?'<p class="a-muted">'+(p.user_ids?.length||kolAccountIds(p).length?'标签用户数据待获取。':'尚未录入标签用户名单。')+'</p>':''}${thisScopeActions('tagged',value,'分析标签用户')}<details><summary>标签用户名单与表现（${rows.length}人）</summary>${rows.length?memberRows(ctx,rows,page):'<p class="a-muted">当前范围没有可展示的用户。</p>'}${rows.length?`<div class="rf-pagination"><span>第 ${page+1}/${Math.ceil(rows.length/20)} 页</span><button class="a-button" data-tag-prev ${page?'':'disabled'}>上一页</button><button class="a-button" data-tag-next ${(page+1)*20<rows.length?'':'disabled'}>下一页</button></div>`:''}</details></section>`
    node.querySelector('[data-crm-exclude-own]').onchange=e=>{excludeOwn=e.target.checked;renderTagged(m,p);bindScopeActions(m,p)}
    if(rows.length){node.querySelector('[data-tag-prev]').onclick=()=>{renderTagged(m,p,page-1);bindScopeActions(m,p)};node.querySelector('[data-tag-next]').onclick=()=>{renderTagged(m,p,page+1);bindScopeActions(m,p)}}
  }
  function renderInvitees(rows,index) {
    const node=host().querySelector('[data-crm-invitees]');if(!node)return
    node.innerHTML=rows.length?`<div class="a-scroll">${table(['账号','绑定 · UTC+7','分析次数（观测）','分析活跃天数','交易笔数','已知成交额 USD'],rows.slice(index*20,(index+1)*20).map(r=>[`<button class="a-tablelink" data-user-profile="${esc(r.user_id)}">${esc(r.user_id)} ↗</button>`,time(r.bound_at),number(r.analysis_events),number(r.analysis_days),number(r.transactions),money(r.volume_usd)]))}</div><div class="rf-pagination"><span>${rows.length} 人 · 第 ${index+1}/${Math.ceil(rows.length/20)} 页</span><div><button class="a-button" data-invite-prev ${index?'':'disabled'}>上一页</button><button class="a-button" data-invite-next ${(index+1)*20<rows.length?'':'disabled'}>下一页</button></div></div>`:'<p class="a-muted">暂无可展示的直接邀请用户。</p>'
    if(rows.length){node.querySelector('[data-invite-prev]').onclick=()=>renderInvitees(rows,index-1);node.querySelector('[data-invite-next]').onclick=()=>renderInvitees(rows,index+1)}
  }
  async function draw() {
    reportState=inheritedReportPeriod(reportState)
    ctx.clear();const id=++epoch;metrics=new Map();metricMeta=null
    if(editing){renderEditor();return}
    host().innerHTML='<div class="a-card si-panel si-loading" role="status">正在加载 KOL CRM…</div>'
    try {
      if(selected) {
        const result=await getKol(selected);if(id!==epoch)return;detail=result;
        if(await loadMetrics([detail.kol],id))renderDetail()
      } else {
        const data=await fetchKolRanking({include_trend:true,...thresholds,q,stage,assignee,sort,direction,scope,view,offset:page*50,limit:50,...(rankingPeriod||period()),snapshot_id:rankingSnapshot,list_version:listVersion});if(id!==epoch)return;
        const correction=remotePageCorrection({page,total:data.total,pageSize:50});
        if(correction.refetch){
          // Preserve the snapshot and list version while retrieving the last
          // valid server page; do not locally sort an incomplete page.
          rankingSnapshot=data.snapshot_id;
          listVersion=data.list_version;
          rankingPeriod={start:data.start,end:data.end};
          page=correction.page;
          return draw();
        }
        page=correction.page;
        rankingSnapshot=data.snapshot_id;listVersion=data.list_version;
        rankingPeriod={start:data.start,end:data.end};metricMeta=data;
        profiles=data.kols;renderList(data)
      }
    } catch(e) {if(id===epoch){host().innerHTML=`<section class="a-card si-panel"><h2>CRM 加载失败</h2><p class="si-error">${esc(e.message)}</p><button class="a-button" data-crm-retry>重试</button><button class="a-button" data-crm-return>返回列表</button></section>`;host().querySelector('[data-crm-retry]').onclick=()=>{resetRanking();draw()};host().querySelector('[data-crm-return]').onclick=()=>{selected=null;resetRanking();draw()}}}
  }
  return {draw,dispose,openKol:(id,{returnToWorkbench:back=false}={})=>{selected=id;editing=null;draft=null;returnToWorkbench=back;feedback='';followupDirty=false;editorDirty=false},hasPendingChanges:()=>!!editing||followupDirty||!!collaborations?.hasPendingChanges()}
}
