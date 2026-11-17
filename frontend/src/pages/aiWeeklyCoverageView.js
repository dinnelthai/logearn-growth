// Compact, decision-ready audit of EVERY supported Growth Skill.
// Historical reports have no coverage manifest: never infer that a module was
// investigated simply because its tool exists or its navigation card exists.
const MODULES=[
 ['growth-overview','增长概览'],['seo-organic','SEO / Search Console'],
 ['channel-growth','渠道获客'],['activation-funnel','用户激活'],
 ['retention','用户留存'],['trade-conversion','产品到交易'],
 ['revenue','收入与渠道经济'],['referral-and-invite','推荐与邀请'],
 ['login-conversion','登录转化'],['kol-impact','KOL 效果'],
 ['content-growth','X 内容增长'],['follower-quality','X 粉丝质量']
];
const LABELS={
 analyzed:'已分析',collected:'已取数待分析',insufficient:'数据不足',
 'not-connected':'未连接 / 未授权','not-investigated':'未调查'
};
function getManifest(data){
 const current=data?.result?.weeklyCoverage;
 if(current?.version==='weekly-coverage-v1'&&Array.isArray(current.modules))
  return current;
 return {version:'historical',modules:MODULES.map(([id,label])=>({
  id,label,status:'not-investigated',
  reason:'历史周报没有逐模块调查记录；无法确认本次是否查询该能力',
  evidenceIds:[],facts:[]
 }))};
}
export function weeklyCoverageRows(data){
 const byId=new Map(getManifest(data).modules.map(row=>[row.id,row]));
 const archived=data?.context_payload||data?.data_snapshot;
 let ctx=archived;
 if(typeof archived==='string'){
  try{ctx=JSON.parse(archived)}catch{ctx=null}
 }
 const observedNumbers=source=>{
  const direct=(source?.facts||[]).filter(f=>typeof f?.value==='number'&&Number.isFinite(f.value))
   .map(f=>f.value);
  const ids=new Set(source?.evidenceIds||[]);
  for(const ev of (Array.isArray(ctx?.evidence)?ctx.evidence:[])){
   if(ids.has(ev.id)&&typeof ev.value==='number'&&Number.isFinite(ev.value))
    direct.push(ev.value);
  }
  return direct;
 };
 const hasNumber=(text,value)=>{
  const str=String(value),pos=String(text||'').indexOf(str);
  if(pos<0)return false;
  const before=text[pos-1]||'',after=text[pos+str.length]||'';
  return !/[0-9.]/.test(before)&&!/[0-9.]/.test(after);
 };
 const isGap=text=>/没有(?:提供|数据|足够)|未(?:提供|采集|同步|取得|能)|缺少|无法(?:判断|确认|核实)|数据不足|尚无/.test(text||'');
 const rows=MODULES.map(([id,label])=>{
  const source=byId.get(id);
  const numbers=observedNumbers(source);
  // A historical v1 manifest could mark a data-gap citation as analyzed.
  // Reclassify only in the view; never rewrite the saved evidence or bill
  // another model request to repair a display label.
  const legacyOverstated=source?.status==='analyzed'&&
   (isGap(source?.insight)||!numbers.some(n=>hasNumber(source?.insight,n)));
  const status=legacyOverstated?(numbers.length?'collected':'insufficient'):
   LABELS[source?.status]?source.status:'not-investigated';
  return {id,label,status,
   reason:legacyOverstated?
    '历史报告仅有调查或数据缺口说明，缺少可核对的模块级数字结论':
    source?.reason||'缺少该模块的调查结果',
   evidenceIds:Array.isArray(source?.evidenceIds)?source.evidenceIds.slice(0,3):[],
   facts:Array.isArray(source?.facts)?source.facts.slice(0,3):[],
   insight:!legacyOverstated&&typeof source?.insight==='string'?source.insight.slice(0,200):'',
   insightType:source?.insightType==='hypothesis'?'hypothesis':
    source?.insightType==='recommendation'?'recommendation':'fact',
   nextAction:typeof source?.nextAction==='string'?source.nextAction.slice(0,160):''};
 });
 return rows;
}
export function weeklyCoverageSummary(data){
 const rows=weeklyCoverageRows(data);
 const analyzed=rows.filter(r=>r.status==='analyzed').length;
 const collected=rows.filter(r=>r.status==='collected').length;
 return {total:rows.length,analyzed,collected,missing:rows.length-analyzed-collected};
}
export function renderWeeklyCoverage(data,{safe,fmt,links}){
 const rows=weeklyCoverageRows(data);
 const analyzed=rows.filter(r=>r.status==='analyzed');
 const collected=rows.filter(r=>r.status==='collected');
 const other=rows.filter(r=>!['analyzed','collected'].includes(r.status));
 const renderCard=row=>'<div class="ai-weekly-module" data-module="'+safe(row.id)+
   '" data-status="'+safe(row.status)+'">'+
    '<div class="ai-weekly-module-top"><strong>'+safe(row.label)+'</strong>'+
     '<span class="ai-weekly-module-status">'+safe(LABELS[row.status])+'</span></div>'+
    '<p>'+safe(row.reason)+'</p>'+
    (row.insight?'<p class="ai-weekly-module-insight"><strong>'+
      (row.insightType==='hypothesis'?'待验证假设：':
       row.insightType==='recommendation'?'AI 建议：':'证据结论：')+
      '</strong>'+safe(row.insight)+'</p>':'')+
    (row.nextAction?'<p class="ai-weekly-module-action"><strong>下步动作：</strong>'+
      safe(row.nextAction)+'</p>':'')+
    (row.facts.length?'<div class="ai-weekly-module-facts">'+
      row.facts.filter(f=>typeof f?.metric==='string'&&
        typeof f.value==='number'&&Number.isFinite(f.value)).slice(0,3).map(f=>
       '<div><span>'+safe(f.metric)+'</span><strong>'+fmt(f.value)+'</strong></div>'
      ).join('')+'</div>':'')+
    (row.evidenceIds.length?'<details class="ai-weekly-ref ai-weekly-source-refs"><summary>查看数据证据（'+row.evidenceIds.length+'）</summary><div>'+links(row.evidenceIds)+'</div></details>':'')+'</div>';
 return '<section class="ai-weekly-section ai-weekly-module-section" id="weekly-coverage">'+
  '<div class="ai-weekly-section-heading"><div>'+
   '<span class="ai-weekly-section-index">03 / SOURCE COVERAGE</span>'+
   '<h4>增长模块调查与分析</h4></div>'+
   '<span>有数值结论 '+analyzed.length+' · 已取数待分析 '+collected.length+
    ' · 数据缺口 '+other.length+'</span></div>'+
  '<p class="ai-weekly-module-intro">12 个增长模块全部保留在归档。只有引用了本模块真实数值的结论才标记为已分析；未调查或数据缺失不代表指标为零。</p>'+
  (analyzed.length||collected.length?
   '<div class="ai-weekly-module-grid">'+[...analyzed,...collected].map(renderCard).join('')+'</div>':
   '<p class="ai-weekly-empty">本期尚无能够形成模块级业务结论的统计记录。</p>')+
  (other.length?'<details class="ai-weekly-coverage-gaps">'+
   '<summary>数据不足、未连接及未调查模块 · '+other.length+' 项（点击展开）</summary>'+
   '<div class="ai-weekly-module-grid">'+other.map(renderCard).join('')+'</div></details>':'')+
  '</section>';
}
export {MODULES};
