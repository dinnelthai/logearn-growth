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
export function renderWeeklyCoverage(data,{safe,fmt,links}){
 const byId=new Map(getManifest(data).modules.map(row=>[row.id,row]));
 const rows=MODULES.map(([id,label])=>{
  const source=byId.get(id);
  return {id,label,status:LABELS[source?.status]?source.status:'not-investigated',
   reason:source?.reason||'缺少该模块的调查结果',
   evidenceIds:Array.isArray(source?.evidenceIds)?source.evidenceIds.slice(0,3):[],
   facts:Array.isArray(source?.facts)?source.facts.slice(0,3):[],
   insight:typeof source?.insight==='string'?source.insight.slice(0,200):'',
   insightType:source?.insightType==='hypothesis'?'hypothesis':
    source?.insightType==='recommendation'?'recommendation':'fact',
   nextAction:typeof source?.nextAction==='string'?source.nextAction.slice(0,160):''};
 });
 const confirmed=rows.filter(r=>r.status==='analyzed').length;
 const collected=rows.filter(r=>r.status==='collected').length;
 const incomplete=rows.length-confirmed-collected;
 return '<section class="ai-weekly-section ai-weekly-module-section">'+
  '<div class="ai-weekly-section-heading"><div>'+
   '<span class="ai-weekly-section-index">03 / SOURCE COVERAGE</span>'+
   '<h4>增长模块调查与分析</h4></div>'+
   '<span>已分析 '+confirmed+' · 已取数待分析 '+collected+' · 其余 '+incomplete+'</span></div>'+
  '<p class="ai-weekly-module-intro">所有 12 个增长模块均列出实际调查状态。已取数不等于 AI 已分析；缺失数据不等于业务指标为零。模型仅引用已授权的聚合证据。</p>'+
  '<div class="ai-weekly-module-grid">'+rows.map(row=>
   '<div class="ai-weekly-module" data-module="'+safe(row.id)+
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
    (row.evidenceIds.length?'<div class="ai-weekly-ref">'+links(row.evidenceIds)+
     '</div>':'')+'</div>').join('')+'</div></section>';
}
export {MODULES};
