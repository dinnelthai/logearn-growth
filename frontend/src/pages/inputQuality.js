/** Snapshot-level diagnostics shared by every page; no generated metrics. */
export function renderInputQuality({root,quality}){
 if(!quality)return
 const document=root.ownerDocument
 const host=document.createElement('details');host.id='as-input-quality';host.className='a-card a-details'
 const summary=document.createElement('summary');summary.textContent='输入与身份数据质量 · 已加载全量快照';host.append(summary)
 const id=quality.identity
 const note=document.createElement('p');note.textContent=`已合并 ${id.mergedAnonymousIds} 个匿名身份；${id.conflictedAnonymousIds} 个匿名身份关联多账号，${id.unmergedAnonymousEvents} 条纯匿名事件保持独立，不归给任一账号。未合并的冲突身份不能代表去重后的真实人数。`;host.append(note)
 for(const [key,label] of [['events','事件'],['users','用户元数据'],['logearnUsers','补充用户元数据'],['referrals','推荐关系']]){
  const q=quality[key];if(!q)continue
  const row=document.createElement('p');row.textContent=`${label}：输入 ${q.input}，接受 ${q.accepted}，排除 ${q.excluded}${q.invalidFields?`；${q.invalidFields} 个非法字段置为未知`:''}${q.missingEventId?`；${q.missingEventId} 条缺事件ID无法可靠去重`:''}。`;host.append(row)
  const reasons=Object.entries(q).filter(([k,v])=>v>0&&!['input','accepted','excluded','invalidFields','missingEventId','conflictingIds','conflictingInvitees'].includes(k))
  if(reasons.length){const labels={invalidRecord:'无效记录',invalidIdentity:'非法身份/事件ID',missingIdentity:'缺身份',invalidContext:'非法上下文',unknownType:'未知事件类型',invalidTime:'无效时间',future:'超出观测截止',duplicates:'相同记录重复',conflictingRows:'冲突记录',invalidId:'缺少或非法ID',selfInvite:'自邀',superseded:'晚于首次的绑定记录'};const detail=document.createElement('p');detail.className='a-muted';detail.textContent=reasons.map(([k,v])=>`${labels[k]??k} ${v}`).join('；');host.append(detail)}
 }
 const warnings=Object.values(quality).some(q=>q&&(q.excluded>0||q.invalidFields>0||q.missingEventId>0))||id.conflictedAnonymousIds>0
 if(warnings){root.querySelector('#as-data-status').append(' 输入存在排除记录、非法字段或身份冲突，详情见下方数据质量。');const banner=document.createElement('p');banner.className='a-status';banner.textContent='存在排除记录、缺失去重ID或身份冲突，指标仅代表保留的已观测事实；覆盖声明不表示这些质量问题已解决。';host.append(banner)}
 root.querySelector('#as-data-status').after(host)
}
