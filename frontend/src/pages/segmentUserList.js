import {fetchDrillUsers,fetchUserTimeline} from '../api/drill.js'
import {createCohort} from '../analytics/cohortClient.js'
import {openCohortTracking} from './cohortTracking.js'

export function mountSegmentUserList(ctx,m,open) {
  const host=ctx.$('[data-segment-users]')
  const input=ctx.$('[data-segment-search]')
  if (!host || !input) return
  const selected=new Set()
  let page=0,request=0,visible=[],saving=false
  const esc=ctx.esc
  const time=t=>t==null?'—':new Date(t+25200000).toISOString().slice(0,16).replace('T',' ')
  const tags=r=>(r.operational_tags||[]).map(t=>(t.type==='activity'?'活动：':'KOL：')+t.name).join('、')||'无'

  function openUser(row) {
    if (ctx.openUserProfile) {
      ctx.openUserProfile(row.id,{start:m.start,end:m.end,snapshot_id:m.drill.snapshot_id})
      return
    }
    ctx.drawer.openRemote({
      title:'用户行为 · '+row.id,
      description:'当前筛选用户，点击用户展开统计期间时间线',
      columns:['用户'],fetchPage:async()=>({total:1,rows:[row]}),
      renderRow:r=>['<button class="a-tablelink" data-user="'+esc(r.id)+'">'+esc(r.id)+'</button>'],
      fetchTimeline:async(uid,el)=>{
        try {
          const data=await fetchUserTimeline({userId:uid,cacheId:m.drill.cache_id,start:m.start,end:m.end,limit:200})
          if(el.isConnected)el.innerHTML='<h2>期间已观测行为 · 最多200条</h2>'+
            data.events.map(e=>'<div class="a-event"><strong>'+esc(ctx.names[e.event_name]||e.event_name)+
            '</strong><div>'+time(e.t)+'</div></div>').join('')
        } catch(e) {if(el.isConnected)el.textContent=e.message}
      }
    })
  }

  async function draw() {
    const token=++request,q=input.value.trim()
    host.innerHTML='<p class="si-loading" role="status">加载用户名单…</p>'
    try {
      const d=await fetchDrillUsers({
        kind:'cached_list',params:{cache_id:m.drill.cache_id,list_key:'all'},
        offset:page*20,limit:20,q
      })
      if(token!==request||!host.isConnected)return
      visible=d.rows
      const rows=d.rows.map(r=>[
        /^user:[^\s]+$/.test(r.id)?
          '<input type="checkbox" data-segment-pick="'+esc(r.id)+'" aria-label="选择 '+esc(r.id)+'" '+(selected.has(r.id)?'checked':'')+'>':'—',
        esc(r.id),esc(tags(r)),esc(r.segment||'未知'),
        (r.behavior_tags||[]).map(t=>'<span class="a-chip" title="'+esc(t.description)+'">'+esc(t.label)+'</span>').join(' ')||'—',
        esc(r.source||'未知'),time(r.first_chip_at),r.trade_count==null?'—':ctx.fmt(r.trade_count),
        '<button class="a-tablelink" data-segment-user="'+esc(r.id)+'">查看行为 ↗</button>'
      ])
      host.innerHTML=(rows.length?ctx.table(
        ['选择','用户','运营标签','行为分群','运营行为标签','首次来源','首次分析 · UTC+7','交易记录数','查看'],rows
      ):'<p class="si-empty">当前筛选没有匹配用户。</p>')+
        '<div class="ct-selection"><button class="a-button" type="button" data-segment-select-page>选择本页</button>' +
        '<form data-segment-save-track class="ct-selection"><label>追踪组名称 <input name="name" maxlength="80" required placeholder="例如：本周重点运营用户"></label>' +
        '<button class="a-button a-primary" type="submit">保存选中并追踪</button></form>' +
        '<span class="a-muted" data-segment-selected>已选择 '+selected.size+' 人（跨页保留）</span></div>' +
        '<p class="si-error" data-segment-track-status role="status"></p>' +
        '<div class="rf-pagination"><span>'+ctx.fmt(d.total)+' 人 · 第 '+(page+1)+'/'+Math.max(1,Math.ceil(d.total/20))+
        ' 页</span><div><button class="a-button" data-prev '+(page?'':'disabled')+
        '>上一页</button><button class="a-button" data-next '+((page+1)*20<d.total?'':'disabled')+
        '>下一页</button></div></div>'
      host.querySelector('[data-prev]').onclick=()=>{page--;draw()}
      host.querySelector('[data-next]').onclick=()=>{page++;draw()}
      host.querySelectorAll('[data-segment-user]').forEach(button=>{
        button.onclick=()=>{const row=d.rows.find(r=>r.id===button.dataset.segmentUser);if(row)openUser(row)}
      })
      function updateCount(){host.querySelector('[data-segment-selected]').textContent='已选择 '+selected.size+' 人（跨页保留）'}
      host.querySelectorAll('[data-segment-pick]').forEach(box=>box.onchange=()=>{
        box.checked?selected.add(box.dataset.segmentPick):selected.delete(box.dataset.segmentPick)
        updateCount()
      })
      host.querySelector('[data-segment-select-page]').onclick=()=>{
        visible.filter(r=>/^user:[^\s]+$/.test(r.id)).forEach(r=>selected.add(r.id))
        host.querySelectorAll('[data-segment-pick]').forEach(el=>{el.checked=true})
        updateCount()
      }
      host.querySelector('[data-segment-save-track]').onsubmit=async event=>{
        event.preventDefault()
        if(saving)return
        const name=event.currentTarget.elements.name.value.trim()
        const status=host.querySelector('[data-segment-track-status]')
        if(!selected.size){status.textContent='请先选中至少一位注册用户';return}
        if(!name){status.textContent='请填写追踪组名称';return}
        saving=true
        const button=event.currentTarget.querySelector('[type=submit]')
        button.disabled=true
        status.textContent='正在保存固定名单…'
        try{
          const result=await createCohort({
            name,user_ids:[...selected].map(id=>id.replace(/^user:/,'')),kind:'static',
            description:'从用户分群列表选择的固定追踪名单'
          })
          if(result.source!=='api')throw new Error('后端不可用，群组仅保存在本地；请连接后端再追踪')
          status.textContent='已保存 '+selected.size+' 位用户，打开追踪详情'
          ctx.refreshCohorts?.()
          openCohortTracking(result.cohort)
        }catch(e){if(status.isConnected)status.textContent='创建失败：'+e.message}
        finally{saving=false;if(button.isConnected)button.disabled=false}
      }
    }catch(e){
      if(token===request&&host.isConnected)host.innerHTML='<p class="si-error">'+esc(e.message)+'</p>'
    }
  }
  input.onchange=()=>{page=0;draw()}
  draw()
}
