import {evaluateLifecycle} from './rules.js'
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function mountLifecycle(host,{users,asOf,rules,onDrill}){
 if(!Array.isArray(rules)||!rules.length)return;
 const rows=evaluateLifecycle(users,{asOf,rules,deliveries:[]});
 host.innerHTML=`<div class="a-card a-details"><div class="a-cardhead"><h2>生命周期分析</h2><span class="a-chip">Dashboard 根据 JSON 计算</span></div><p>状态、条件和建议动作来自用户行为与 lifecycle-rules.json；同一用户可以命中多个场景。不包含发送或频控统计。</p><div class="a-scroll"><table><thead><tr>${['场景','判断条件','建议动作','命中用户'].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${rules.filter(r=>r.enabled).sort((a,b)=>a.priority-b.priority).map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.condition)}</td><td>${esc(r.action)}</td><td><button class="a-tablelink" data-lifecycle="${esc(r.id)}">${new Set(rows.filter(x=>x.rule_id===r.id).map(x=>x.u.id)).size}</button></td></tr>`).join('')}</tbody></table></div></div>`;
 host.querySelectorAll('[data-lifecycle]').forEach(b=>b.onclick=()=>{const rule=rules.find(r=>r.id===b.dataset.lifecycle);onDrill(rule.name,rows.filter(r=>r.rule_id===rule.id).map(r=>r.u),'根据 JSON 用户与事件计算')});
}
