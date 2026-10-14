import {fetchUserTags,tagAudience} from '../api/userTags.js'
export function mountTagAudience(root,ctx){
  const host=document.createElement('section');host.className='a-card si-panel';host.id='as-tag-audience'
  root.querySelector('#as-data-status').insertAdjacentElement('afterend',host)
  let epoch=0,activity='',kol='',match='all'
  async function draw(mode){
    const id=++epoch;host.hidden=!['funnel','retention','paths','channels','referral','trade-monitor'].includes(mode)
    if(host.hidden)return
    host.innerHTML='<p class="a-muted">正在加载活动 / KOL 分析标签…</p>'
    try{
      const tags=await fetchUserTags();if(id!==epoch)return
      const select=(type,value,label)=>`<label>${label}<select data-tag="${type}"><option value="">全部</option>${tags.filter(t=>t.type===type).map(t=>`<option value="${ctx.esc(t.id)}" ${t.id===value?'selected':''}>${ctx.esc(t.name)}（${t.users}人）</option>`).join('')}</select></label>`
      host.innerHTML=`<details><summary>按活动 / KOL 标签分析</summary><div class="crm-form-grid">${select('activity',activity,'活动标签')}${select('kol',kol,'KOL 标签')}<label>标签匹配<select data-match><option value="all" ${match==='all'?'selected':''}>同时拥有所选标签</option><option value="any" ${match==='any'?'selected':''}>拥有任一所选标签</option></select></label></div><p class="a-muted">应用后固定这批用户，可继续查看漏斗、留存、路径、渠道、推荐及交易。已有分析人群时，标签与该人群取交集。</p><button class="a-button a-primary" data-apply-tags>使用标签人群</button><p role="status" data-tag-status></p></details>`
      host.querySelector('[data-tag=activity]').onchange=e=>activity=e.target.value
      host.querySelector('[data-tag=kol]').onchange=e=>kol=e.target.value
      host.querySelector('[data-match]').onchange=e=>match=e.target.value
      host.querySelector('[data-apply-tags]').onclick=async e=>{
        const button=e.target,status=host.querySelector('[data-tag-status]');button.disabled=true;status.textContent='正在应用标签人群…'
        try{const c=ctx.config(),a=await tagAudience({tag_ids:[activity,kol].filter(Boolean),tag_mode:match,start:c.start,end:c.end,source:c.source||'all',snapshot_id:c.snapshotId,audience_ids:c.audienceIds,cohort_id:c.cohortId});if(id!==epoch)return;ctx.apply(a)}
        catch(error){if(id===epoch)status.textContent=error.message}finally{if(id===epoch)button.disabled=false}
      }
    }catch(e){if(id===epoch)host.innerHTML=`<p class="si-error">标签加载失败：${ctx.esc(e.message)}</p><button class="a-button" data-tag-retry>重试</button>`;host.querySelector('[data-tag-retry]')?.addEventListener('click',()=>draw(mode))}
  }
  return {draw}
}
