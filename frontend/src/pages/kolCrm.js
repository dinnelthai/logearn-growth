import {listKols,getKol,saveKol,fetchKolMetrics,addFollowup,linkKolActivity,unlinkKolActivity} from '../api/crm.js'
import {listActivities} from '../api/activities.js'
import {observedTime} from './observedDrill.js'
const STAGES=['待联系','已联系','沟通中','试用中','合作中','暂停','已结束']
const DAY=86400000,OFFSET=25200000
export function createKolCrm(ctx) {
  const {$,esc,fmt,table}=ctx
  let epoch=0,selected=null,editing=null,draft=null,q='',stage='',assignee='',page=0,days=28,profiles=[],metrics=new Map(),metricMeta=null,detail=null
  const host=()=>$('#as-output'),time=value=>value==null?'—':observedTime(value)
  const number=value=>value==null?'—':fmt(value)
  const money=value=>value==null?'—':'$'+Number(value).toLocaleString('en-US',{maximumFractionDigits:2})
  const localTime=value=>value==null?'':new Date(value+OFFSET).toISOString().slice(0,16)
  const parseTime=value=>value?Date.parse(value+':00+07:00'):null
  const period=()=>{const end=Math.floor((Date.now()+OFFSET)/DAY)*DAY-OFFSET+DAY;return {start:end-days*DAY,end}}
  const error=(node,e)=>{if(node?.isConnected)node.textContent=e.message}
  const metricCell=(m,key,group='own')=>!m?'加载中':!m.available?esc(m.reason):group==='invited'&&!m.invited?'待获取':key==='volume_usd'?money(m[group].total[key]):number(m[group].total[key])
  function dispose(){epoch++}
  function toolbar(title,subtitle,extra='') {
    return `<header class="crm-toolbar"><div><h2>${esc(title)}</h2><p class="a-muted">${esc(subtitle)}</p></div><div class="activity-actions">${extra}<label class="crm-period">统计期<select data-crm-days>${[7,28,90].map(n=>`<option value="${n}" ${days===n?'selected':''}>最近${n}天（含今日）</option>`).join('')}</select></label><button class="a-button" data-crm-refresh>刷新</button></div></header>`
  }
  function bindToolbar() {
    host().querySelector('[data-crm-days]').onchange=e=>{days=Number(e.target.value);draw()}
    host().querySelector('[data-crm-refresh]').onclick=()=>draw()
  }
  function coverage() {
    const failures=Object.entries(metricMeta?.errors||{}).filter(([,v])=>v).map(([k,v])=>`${{analysis:'分析',trade:'交易',referral:'推荐'}[k]}：${v}`).join('；')
    return `<p class="si-footnote">${metricMeta?.as_of?'数据截至 '+time(Date.parse(metricMeta.as_of))+' · UTC+7。':''}分析次数为去重后的筹码展示 / 下钻事件数，历史事件尚不能保证一次操作只计一次。成交额为已知 USD 金额，旧业务身份经验证映射；未匹配身份不纳入，覆盖不完整。未观测记录不证明没有使用。${failures?'<span class="si-error"> '+esc(failures)+'</span>':''}</p>`
  }
  async function loadMetrics(list,id) {
    try {
      const result=await fetchKolMetrics({kol_ids:list.map(p=>p.id),...period()})
      if(id!==epoch)return false
      metricMeta=result;metrics=new Map(result.metrics.map(m=>[m.id,m]));return true
    } catch(e) {
      if(id!==epoch)return false
      metricMeta={errors:{analysis:e.message,trade:e.message,referral:e.message}}
      metrics=new Map(list.map(p=>[p.id,{available:false,reason:p.account_id?'数据待获取':'尚未关联账号'}]));return true
    }
  }
  function renderList(data) {
    host().innerHTML=`<div class="si-page crm-page">${toolbar('KOL CRM','录入合作对象，跟进本人使用、交易及直接邀请贡献','<button class="a-button a-primary" data-crm-new>＋ 录入 KOL</button>')}<div class="crm-summary"><span>共 <strong>${fmt(data.summary.total)}</strong> 个 KOL</span><span>待跟进 <strong>${fmt(data.summary.due)}</strong> 个</span></div><section class="a-card si-panel"><div class="crm-filters"><label>搜索<input data-crm-search value="${esc(q)}" placeholder="名称、平台、账号、标签"></label><label>合作阶段<select data-crm-stage><option value="">全部阶段</option>${STAGES.map(s=>`<option ${stage===s?'selected':''}>${s}</option>`).join('')}</select></label><label>负责人<select data-crm-assignee><option value="">全部负责人</option>${data.assignees.map(s=>`<option ${assignee===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label></div><div class="a-scroll" data-crm-table></div><div class="rf-pagination"><span>匹配 ${fmt(data.total)} 个 · 第 ${page+1}/${Math.max(1,Math.ceil(data.total/50))} 页</span><div><button class="a-button" data-crm-prev ${page?'':'disabled'}>上一页</button><button class="a-button" data-crm-next ${(page+1)*50<data.total?'':'disabled'}>下一页</button></div></div></section><div data-crm-coverage></div></div>`
    bindToolbar();host().querySelector('[data-crm-new]').onclick=()=>{editing='new';draft={stage:'待联系'};renderEditor()}
    for(const [attr,set] of [['search',v=>q=v],['stage',v=>stage=v],['assignee',v=>assignee=v]])host().querySelector('[data-crm-'+attr+']').onchange=e=>{set(e.target.value.trim());page=0;draw()}
    host().querySelector('[data-crm-prev]').onclick=()=>{page--;draw()};host().querySelector('[data-crm-next]').onclick=()=>{page++;draw()}
    renderRows()
  }
  function renderRows() {
    const node=host().querySelector('[data-crm-table]');if(!node)return
    node.innerHTML=profiles.length?table(['KOL / 平台','阶段 / 负责人','LogEarn 账号','本人成交额 USD','分析次数（观测）','期间最近分析 · UTC+7','直接邀请人数','邀请用户成交额 USD','下次跟进 · UTC+7'],profiles.map(p=>{
      const m=metrics.get(p.id)
      return [`<button class="a-tablelink" data-crm-open="${esc(p.id)}">${esc(p.name)} ↗</button><div class="a-muted">${esc(p.platform)}</div>`,esc(p.stage)+'<div class="a-muted">'+esc(p.assignee||'未分配')+'</div>',esc(p.account_id||'待关联'),metricCell(m,'volume_usd'),metricCell(m,'analysis_events'),m?.available?time(m.own.total.last_analysis_at):'—',metricCell(m,'users','invited'),metricCell(m,'volume_usd','invited'),time(p.next_followup_at)]
    })):'<div class="crm-empty"><h2>还没有匹配的 KOL</h2><p>录入名称、平台与合作信息；关联 LogEarn 账号后即可追踪业务表现。</p><button class="a-button a-primary" data-crm-empty-new>录入 KOL</button></div>'
    node.querySelectorAll('[data-crm-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.crmOpen;draw()})
    const add=node.querySelector('[data-crm-empty-new]');if(add)add.onclick=()=>host().querySelector('[data-crm-new]').click()
    host().querySelector('[data-crm-coverage]').innerHTML=coverage()
  }
  function renderEditor() {
    const p=draft||{},field=(key,label,max=80,type='text')=>`<label>${label}<input name="${key}" type="${type}" maxlength="${max}" value="${esc(p[key]||'')}" ${['name','platform'].includes(key)?'required':''}></label>`
    host().innerHTML=`<div class="si-page crm-page"><header class="crm-toolbar"><div><h2>${editing==='new'?'录入 KOL':'编辑档案 · '+esc(p.name)}</h2><p class="a-muted">账号 ID 会校验注册账号；同一账号不能重复关联。</p></div><button class="a-button" data-crm-cancel>返回</button></header><section class="a-card si-panel"><form data-crm-profile><div class="crm-form-grid">${field('name','KOL 名称')}${field('platform','平台（如 X / Telegram / YouTube）',40)}${field('profile_url','主页链接',500,'url')}${field('account_id','LogEarn 注册账号 ID（可稍后关联）',20)}${field('assignee','负责人')}${field('contact','联系方式',200)}${field('language','地区 / 语言',40)}${field('tags','标签（逗号分隔）',200)}<label>合作阶段<select name="stage">${STAGES.map(s=>`<option ${p.stage===s?'selected':''}>${s}</option>`).join('')}</select></label><label>下次跟进时间 · UTC+7<input name="next_followup" type="datetime-local" value="${localTime(p.next_followup_at)}"></label></div><label>KOL 标签用户名单（每行一个注册账号 ID）<textarea name="user_ids" rows="4" placeholder="输入后给这些用户打上该 KOL 名称标签">${esc(Array.isArray(p.user_ids)?p.user_ids.join('\n'):p.user_ids||'')}</textarea></label><p class="a-muted">关联账号也自动带有此 KOL 标签；用户分群可按标签筛选。名单与直接邀请关系分别保存。</p><label>备注<textarea name="notes" rows="4" maxlength="4000">${esc(p.notes||'')}</textarea></label><p class="si-error" data-crm-error role="alert"></p><div class="activity-actions"><button type="submit" class="a-button a-primary">保存档案</button><button type="button" class="a-button" data-crm-cancel>取消</button></div></form></section></div>`
    host().querySelectorAll('[data-crm-cancel]').forEach(b=>b.onclick=()=>{editing=null;draft=null;draw()})
    const form=host().querySelector('form')
    const values=()=>{const value=Object.fromEntries(new FormData(form));value.account_id=value.account_id||null;value.next_followup_at=parseTime(value.next_followup);delete value.next_followup;return value}
    form.oninput=()=>{draft={...p,...values()}}
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]'),node=form.querySelector('[data-crm-error]');button.disabled=true;node.textContent=''
      try {const result=await saveKol(editing==='new'?null:editing,{...values(),...(editing==='new'?{}:{expected_updated_at:p.updated_at})});if(!form.isConnected)return;selected=result.kol.id;editing=null;draft=null;await draw()}
      catch(err){error(node,err);button.disabled=false}
    }
  }
  function renderDetail() {
    const {kol:p,activities,followups}=detail,m=metrics.get(p.id),card=(label,value,note)=>`<div class="si-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`
    const own=m?.available?m.own.total:null,invited=m?.available?m.invited:null
    host().innerHTML=`<div class="si-page crm-page">${toolbar(p.name,p.platform+' · '+p.stage+' · 负责人 '+(p.assignee||'未分配'),'<button class="a-button" data-crm-back>返回列表</button><button class="a-button" data-crm-edit>编辑档案</button>')}<section class="a-card si-panel"><div class="crm-profile"><span>LogEarn 账号：<strong>${esc(p.account_id||'待关联')}</strong></span><span>联系方式：${esc(p.contact||'未填写')}</span><span>地区 / 语言：${esc(p.language||'未填写')}</span><span>标签：${esc(p.tags||'未填写')}</span><span>KOL 标签用户名单：${fmt(p.user_ids?.length||0)} 人（关联账号自动纳入）</span><span>下次跟进：${time(p.next_followup_at)}</span>${p.profile_url?`<a href="${esc(p.profile_url)}" target="_blank" rel="noopener noreferrer">查看主页 ↗</a>`:''}</div>${p.notes?`<p class="crm-note">${esc(p.notes)}</p>`:''}</section><h2 class="crm-section-title">本人使用与交易</h2>${!m?'<p class="a-muted">正在读取业务指标…</p>':!m.available?`<p class="a-muted">${esc(m.reason)}</p>`:''}<div class="crm-kpis">${card('已知成交额 USD',money(own?.volume_usd),'本人在统计期内的交易')}${card('交易笔数',number(own?.transactions),'链 + 交易哈希去重')}${card('分析次数（观测）',number(own?.analysis_events),'筹码展示 / 下钻事件去重')}${card('分析活跃天数',number(own?.analysis_days),'本人 · UTC+7 自然日')}</div><p class="a-muted">期间最近分析：${time(own?.last_analysis_at)}${own?.missing_values?' · '+number(own.missing_values)+' 笔交易缺金额':''}${own?.excluded_trades?' · '+number(own.excluded_trades)+' 组交易缺标识或冲突已排除':''}</p><h2 class="crm-section-title">直接邀请贡献</h2><div class="crm-kpis">${card('截至期末直接邀请人数',number(invited?.total.users),'后端有效一级绑定')}${card('本期新绑定人数',number(invited?.new_bindings),'按绑定时间统计')}${card('邀请用户分析次数（观测）',number(invited?.total.analysis_events),'统计期内且绑定后的行为')}${card('邀请用户已知成交额 USD',money(invited?.total.volume_usd),'统计期内且绑定后的交易')}</div>${m?.available&&!invited?'<p class="a-muted">推荐数据暂不可用，不能按零贡献解释。</p>':''}<details class="a-card si-panel"><summary>每日本人表现</summary><div class="a-scroll">${m?.available?table(['日期 · UTC+7','分析次数（观测）','交易笔数','已知成交额 USD'],m.own.daily.map(d=>[esc(d.date),number(d.analysis_events),number(d.transactions),money(d.volume_usd)])):'<p>业务指标待获取。</p>'}</div><p class="a-muted">仅列出已观测行为日期；空日期不证明采集完整。</p></details><details class="a-card si-panel"><summary>直接邀请用户表现</summary><div data-crm-invitees></div></details><section class="a-card si-panel"><div class="crm-toolbar"><div><h2>关联活动</h2><p class="a-muted">活动名单独立固定；关联不代表所有参与者都由该 KOL 邀请。</p></div><button class="a-button" data-crm-create-activity>＋ 创建关联活动</button></div><div class="a-scroll">${activities.length?table(['活动','状态','开始 · UTC+7','截止 · UTC+7','操作'],activities.map(a=>[`<button class="a-tablelink" data-crm-activity="${esc(a.id)}">${esc(a.name)} ↗</button>`,a.settled_at?'已结算':a.cutoff_at<=Date.now()?'已截止':'进行中',time(a.start_at),time(a.cutoff_at),`<button class="a-tablelink" data-crm-unlink="${esc(a.id)}">取消关联</button>`])):'<p class="a-muted">还没有关联活动。</p>'}</div><form class="crm-link-form" data-crm-link><label>关联已有活动<select name="activity_id" data-crm-activity-options><option value="">正在加载活动…</option></select></label><button class="a-button" type="submit" disabled>关联活动</button></form><p class="si-error" data-crm-link-error role="alert"></p></section><section class="a-card si-panel"><h2>跟进记录</h2><form data-crm-followup><label>本次跟进<textarea name="content" required maxlength="4000" rows="3" placeholder="记录沟通内容、反馈与合作进展"></textarea></label><div class="crm-form-grid"><label>下一步<input name="next_step" maxlength="1000" placeholder="下一步处理"></label><label>下次跟进时间 · UTC+7<input name="next_followup" type="datetime-local" value="${localTime(p.next_followup_at)}"></label></div><p class="si-error" role="alert" data-crm-followup-error></p><button type="submit" class="a-button a-primary">保存跟进</button></form><div class="crm-followups">${followups.length?followups.map(f=>`<article><div class="a-muted">${time(f.created_at)} · UTC+7</div><p class="crm-note">${esc(f.content)}</p>${f.next_step?`<p>下一步：${esc(f.next_step)}</p>`:''}</article>`).join(''):'<p class="a-muted">还没有跟进记录。</p>'}</div></section><details class="a-card si-panel"><summary>档案修改记录</summary>${detail.history.map(h=>{const a=JSON.parse(h.after_json),b=h.before_json?JSON.parse(h.before_json):null;const changes=b?Object.keys(a).filter(k=>!['updated_at'].includes(k)&&a[k]!==b[k]).map(k=>`${{account_id:'账号',stage:'合作阶段',assignee:'负责人',next_followup_at:'下次跟进',name:'名称',platform:'平台',contact:'联系方式',tags:'标签',notes:'备注',language:'地区 / 语言',profile_url:'主页',user_ids:'标签用户名单'}[k]||k}：${k==='next_followup_at'?time(a[k]):a[k]??'清空'}`).join('；'):'创建档案';return `<p>${time(h.created_at)} · ${esc(changes||'保存档案')}</p>`}).join('')}</details>${coverage()}</div>`
    bindToolbar();host().querySelector('[data-crm-back]').onclick=()=>{selected=null;draw()};host().querySelector('[data-crm-edit]').onclick=()=>{editing=p.id;draft={...p};renderEditor()}
    host().querySelector('[data-crm-create-activity]').onclick=()=>ctx.createActivityForKol(p)
    host().querySelectorAll('[data-crm-activity]').forEach(b=>b.onclick=()=>ctx.openActivity(b.dataset.crmActivity))
    host().querySelectorAll('[data-crm-unlink]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await unlinkKolActivity(p.id,b.dataset.crmUnlink);if(b.isConnected)draw()}catch(e){error(host().querySelector('[data-crm-link-error]'),e);b.disabled=false}})
    const follow=host().querySelector('[data-crm-followup]');follow.onsubmit=async e=>{e.preventDefault();const button=follow.querySelector('button'),node=follow.querySelector('[data-crm-followup-error]');button.disabled=true;node.textContent=''
      try{const v=Object.fromEntries(new FormData(follow));await addFollowup(p.id,{content:v.content,next_step:v.next_step,next_followup_at:parseTime(v.next_followup)});if(follow.isConnected)draw()}catch(e){error(node,e);button.disabled=false}
    }
    const link=host().querySelector('[data-crm-link]');link.onsubmit=async e=>{e.preventDefault();const button=link.querySelector('button');button.disabled=true;try{if(!link.elements.activity_id.value)throw Error('请选择活动');await linkKolActivity(p.id,link.elements.activity_id.value);if(link.isConnected)draw()}catch(e){error(host().querySelector('[data-crm-link-error]'),e);button.disabled=false}}
    listActivities().then(result=>{if(!link.isConnected)return;const options=result.activities.filter(a=>!activities.some(x=>x.id===a.id));link.elements.activity_id.innerHTML='<option value="">选择活动</option>'+options.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');link.querySelector('button').disabled=!options.length}).catch(e=>{if(link.isConnected){link.elements.activity_id.innerHTML='<option>活动暂不可用</option>';error(host().querySelector('[data-crm-link-error]'),e)}})
    renderInvitees(invited?.rows||[],0)
  }
  function renderInvitees(rows,index) {
    const node=host().querySelector('[data-crm-invitees]');if(!node)return
    node.innerHTML=rows.length?`<div class="a-scroll">${table(['账号','绑定 · UTC+7','分析次数（观测）','分析活跃天数','交易笔数','已知成交额 USD'],rows.slice(index*20,(index+1)*20).map(r=>[esc(r.user_id),time(r.bound_at),number(r.analysis_events),number(r.analysis_days),number(r.transactions),money(r.volume_usd)]))}</div><div class="rf-pagination"><span>${rows.length} 人 · 第 ${index+1}/${Math.ceil(rows.length/20)} 页</span><div><button class="a-button" data-invite-prev ${index?'':'disabled'}>上一页</button><button class="a-button" data-invite-next ${(index+1)*20<rows.length?'':'disabled'}>下一页</button></div></div>`:'<p class="a-muted">暂无可展示的直接邀请用户。</p>'
    if(rows.length){node.querySelector('[data-invite-prev]').onclick=()=>renderInvitees(rows,index-1);node.querySelector('[data-invite-next]').onclick=()=>renderInvitees(rows,index+1)}
  }
  async function draw() {
    ctx.clear();const id=++epoch;metrics=new Map();metricMeta=null
    if(editing){renderEditor();return}
    host().innerHTML='<div class="a-card si-panel">正在加载 KOL CRM…</div>'
    try {
      if(selected) {
        const result=await getKol(selected);if(id!==epoch)return;detail=result;
        if(await loadMetrics([detail.kol],id))renderDetail()
      } else {
        const data=await listKols({q,stage,assignee,offset:page*50,limit:50});if(id!==epoch)return;profiles=data.kols;renderList(data)
        if(profiles.length&&await loadMetrics(profiles,id))renderRows()
      }
    } catch(e) {if(id===epoch){host().innerHTML=`<section class="a-card si-panel"><h2>CRM 加载失败</h2><p class="si-error">${esc(e.message)}</p><button class="a-button" data-crm-retry>重试</button><button class="a-button" data-crm-return>返回列表</button></section>`;host().querySelector('[data-crm-retry]').onclick=draw;host().querySelector('[data-crm-return]').onclick=()=>{selected=null;draw()}}}
  }
  return {draw,dispose,openKol:id=>{selected=id;editing=null;draft=null},hasPendingChanges:()=>!!editing}
}
