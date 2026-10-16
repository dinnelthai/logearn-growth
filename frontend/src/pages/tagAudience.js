import {resolveSavedCohort} from '../analytics/savedCohort.js'
import {fetchUserTags,tagAudience} from '../api/userTags.js'
import {listCohorts} from '../analytics/cohortClient.js'
import {fetchBackendMeta} from '../api/backendAnalytics.js'
import {audienceBase,tagSelectionRequest,selectedTagAudience} from '../analytics/audienceSelection.js'
export function mountTagAudience(root,ctx){
 const host=document.createElement('section');host.className='a-card si-panel';host.id='as-tag-audience'
 root.querySelector('#as-data-status').insertAdjacentElement('afterend',host)
 let epoch=0,activity='',kol='',match='all',kind='tags',cohort='',intersect=false
 async function draw(mode){
  const id=++epoch;host.hidden=!['segments','funnel','retention','paths','channels','referral','trade-monitor'].includes(mode)
  if(host.hidden)return
  const current=ctx.getAudience(),recipe=current?.selection
  if(recipe?.kind==='tags'){[activity,kol]=['activity:','kol:'].map(prefix=>recipe.tagIds.find(t=>t.startsWith(prefix))||'');match=recipe.mode;kind='tags'}
  if(recipe?.kind==='cohort'){kind='cohort';cohort=recipe.id}
  host.innerHTML='<p class="a-muted si-loading" role="status">正在加载分析人群…</p>'
  try{
   const [tags,saved]=await Promise.all([fetchUserTags(),listCohorts()]);if(id!==epoch)return
   const select=(type,value,label)=>`<label>${label}<select data-tag="${type}"><option value="">不限制</option>${tags.filter(t=>t.type===type).map(t=>`<option value="${ctx.esc(t.id)}" ${t.id===value?'selected':''}>${ctx.esc(t.name)}（${t.users}人）</option>`).join('')}</select></label>`
   const base=audienceBase(current)
   host.innerHTML=`<details ${current?'':'open'}><summary>分析人群 · ${ctx.esc(current?.title||'尚未选择固定人群')}</summary><div class="crm-form-grid"><label>选择方式<select data-audience-kind><option value="tags" ${kind==='tags'?'selected':''}>活动 / KOL 标签</option><option value="cohort" ${kind==='cohort'?'selected':''}>保存人群</option><option value="all" ${kind==='all'?'selected':''}>全部注册用户</option></select></label><div data-audience-tags>${select('activity',activity,'活动标签')}${select('kol',kol,'KOL 标签')}<label>标签匹配<select data-match><option value="all" ${match==='all'?'selected':''}>同时拥有所选标签</option><option value="any" ${match==='any'?'selected':''}>拥有任一所选标签</option></select></label></div><label data-audience-cohort>保存人群<select data-cohort><option value="">选择保存的人群</option>${saved.cohorts.map(c=>`<option value="${ctx.esc(c.id)}" ${cohort===c.id?'selected':''}>${ctx.esc(c.name)}（${c.kind==='dynamic'?'动态 · 使用时计算':(c.member_count??c.user_ids?.length??0)+'人'}）</option>`).join('')}</select></label></div><p class="a-muted">${base?'基础人群：'+ctx.esc(base.title)+'。更换标签会替换上次标签过滤。':'标签从全部注册用户中圈选。'}应用后固定名单，可跨模块继续分析。</p><label ${current?'':'hidden'}><input type="checkbox" data-intersect ${intersect?'checked':''}> 与当前完整名单取交集</label><div class="a-audience-actions"><button class="a-button a-primary" data-apply-tags>应用人群</button>${recipe?.kind==='tags'||recipe?.kind==='cohort'?'<button class="a-button" data-recalculate>重新计算名单</button>':''}</div><p role="status" data-tag-status></p></details>`
   const visibility=()=>{host.querySelector('[data-audience-tags]').hidden=kind!=='tags';host.querySelector('[data-audience-cohort]').hidden=kind!=='cohort'};visibility()
   host.querySelector('[data-audience-kind]').onchange=e=>{kind=e.target.value;visibility()}
   host.querySelector('[data-tag=activity]').onchange=e=>activity=e.target.value
   host.querySelector('[data-tag=kol]').onchange=e=>kol=e.target.value
   host.querySelector('[data-match]').onchange=e=>match=e.target.value
   host.querySelector('[data-cohort]').onchange=e=>cohort=e.target.value
   host.querySelector('[data-intersect]').onchange=e=>intersect=e.target.checked
   async function apply(e){const button=e.target,status=host.querySelector('[data-tag-status]');host.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);status.textContent='正在计算人群…'
    try{
     if(kind==='all'){ctx.clear();return}
     const c=ctx.config(),meta=await fetchBackendMeta(),now=ctx.getAudience();let a
     if(kind==='tags'){
      const ids=[activity,kol].filter(Boolean);if(!ids.length)throw Error('请至少选择一个活动或 KOL 标签')
      const selection=tagSelectionRequest(c,now,ids,match,intersect)
      const value=await tagAudience({...selection.body,snapshot_id:meta.snapshot_id})
      a=selectedTagAudience(value,selection.base,ids,match)
     }else{
      if(!cohort)throw Error('请选择保存人群')
      const saved=await resolveSavedCohort(cohort,c,meta),allowed=intersect&&now?new Set(now.ids):null,selected=allowed?saved.ids.filter(id=>allowed.has(id)):saved.ids
      a={...saved,ids:selected,count:selected.length,title:saved.title+(allowed?' ∩ '+now.title:''),description:saved.description+(allowed?' · 与当前名单取交集':'')}

     }
     if(id!==epoch)return;ctx.apply(a)
    }catch(error){if(id===epoch)status.textContent=error.message}finally{if(id===epoch)host.querySelectorAll('input,select,button').forEach(el=>el.disabled=false)}
   }
   host.querySelector('[data-apply-tags]').onclick=apply;host.querySelector('[data-recalculate]')?.addEventListener('click',apply)
  }catch(e){if(id===epoch)host.innerHTML=`<p class="si-error">人群加载失败：${ctx.esc(e.message)}</p><button class="a-button" data-tag-retry>重试</button>`;host.querySelector('[data-tag-retry]')?.addEventListener('click',()=>draw(mode))}
 }
 return {draw}
}
