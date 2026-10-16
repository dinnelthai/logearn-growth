import {targetFields} from './activityTargets.js'
import {rosterImportHTML,mountRosterImport} from './rosterImport.js'
import {validateBatchIds} from '../api/activities.js'
import {activityBatches,appendActivityBatch,updateActivityTag,archiveActivity,activityRoster} from '../api/activities.js'
import {observedTime} from './observedDrill.js'
export async function mountActivityRoster(host,a,ctx){
 const {esc,fmt}=ctx
 host.innerHTML='<p class="a-muted si-loading" role="status">正在加载批次与标签…</p>'
 try{
  const d=await activityBatches(a.id);if(!host.isConnected)return
  const root=d.root,open=root.schedule_state!=='scheduled'&&!root.archived_at&&!root.settled_at&&Date.now()<root.cutoff_at
  host.innerHTML=`<details class="a-card si-panel operations-roster"><summary>名单管理 · ${d.batches.length} 个批次 · 当前活动标签 ${fmt(d.tag_user_ids.length)} 人</summary><p class="a-muted">每批次独立固定名单、开始时间与结果。当前标签用于分群筛选，编辑标签不会改写活动统计。</p><div class="a-scroll">${ctx.table(['批次','开始时间 · UTC+7','固定人数','操作'],d.batches.map((b,i)=>[esc(b.name)+(i?'':' · 初始批次'),observedTime(b.start_at),b.schedule_state==='scheduled'?'计划 '+fmt(b.planned_count)+' 人 · 未固定':fmt(b.member_count),`<button class="a-tablelink" data-open-batch="${esc(b.id)}">查看结果 →</button>`]))}</div>${open?`<form data-batch-form><h3>追加新批次</h3><label>批次名称<input name="name" maxlength="80" required></label>${rosterImportHTML(esc)}${targetFields(esc,root.goal)}<button class="a-button" type="submit" disabled>追加并开始监控</button></form>`:''}<form data-tag-form><h3>当前活动标签</h3><p class="a-muted">标签：${esc(root.name)} · 批次共用此标签</p><details><summary>查看当前标签名单</summary><p style="overflow-wrap:anywhere">${esc(d.tag_user_ids.join('、')||'暂无用户')}</p></details><label>用户 ID<textarea name="ids" rows="3" required></textarea></label><label>操作<select name="action"><option value="add">添加标签</option><option value="remove">移除标签</option></select></label><button class="a-button" type="submit">更新当前标签</button></form><div class="activity-actions"><button class="a-button" data-copy-activity>复制本批次为新活动</button><button class="a-button" data-archive-activity>${a.archived_at?'恢复活动':a.parent_id?'归档此批次':'归档活动及全部批次'}</button></div><p class="si-error" data-roster-status role="status"></p></details>`
  const status=host.querySelector('[data-roster-status]')
  async function perform(button,fn){button.disabled=true;status.textContent='正在保存…';try{await fn()}catch(e){if(host.isConnected)status.textContent=e.message}finally{button.disabled=false}}
  host.querySelectorAll('[data-open-batch]').forEach(b=>b.onclick=()=>ctx.open(b.dataset.openBatch))
  const batch=host.querySelector('[data-batch-form]');if(batch)mountRosterImport(batch.querySelector('[data-roster-import]'),ctx,{validate:ids=>validateBatchIds(root.id,ids),onValidated:v=>{batch.querySelector('[type=submit]').disabled=!v?.matched}});if(batch)batch.onsubmit=e=>{e.preventDefault();perform(batch.querySelector('[type=submit]'),async()=>{const r=await appendActivityBatch(root.id,{name:batch.elements.name.value,user_ids:batch.elements.ids.value,...(batch.elements.target_metric.value?{target_metric:batch.elements.target_metric.value,target_value:Number(batch.elements.target_value.value)}:{})});if(host.isConnected)ctx.open(r.activity.id)})}
  const tag=host.querySelector('[data-tag-form]');tag.onsubmit=e=>{e.preventDefault();perform(tag.querySelector('button'),async()=>{await updateActivityTag(root.id,{user_ids:tag.elements.ids.value,action:tag.elements.action.value,expected_tag_version:root.tag_version});if(host.isConnected)await mountActivityRoster(host,a,ctx)})}
  host.querySelector('[data-copy-activity]').onclick=e=>perform(e.target,async()=>{const r=await activityRoster(a.id);if(host.isConnected)ctx.copy(r)})
  host.querySelector('[data-archive-activity]').onclick=e=>perform(e.target,async()=>{await archiveActivity(a.id,!a.archived_at);if(host.isConnected)ctx.refresh()})
 }catch(e){if(host.isConnected)host.innerHTML=`<p class="si-error">名单管理加载失败：${esc(e.message)}</p>`}
}
