'use strict';
// Prioritize existing business questions without inventing affected users,
// confidence, causal impact or SQL billing. Currency cost remains unknown.
const {timingFor}=require('./queryEconomics');
const GOAL={
 activation:new Set(['registration_activation_rate','activation_rate','new_users','registered_users']),
 retention:new Set(['d7','returning_users','active_users']),
 conversion:new Set(['registered_trade_conversion_rate','registration_activation_rate','activation_rate','new_users']),
 revenue:new Set(['registered_trade_conversion_rate','weekly_core'])
};
const TOOLS={
 active_users:'query_metrics',new_users:'query_metrics',
 returning_users:'query_metrics',registered_users:'query_metrics',
 weekly_core:'query_metrics',registration_activation_rate:'query_metrics',
 registered_trade_conversion_rate:'query_metrics',
 activation_rate:'get_funnel',d7:'get_retention'
};
const PRIORITY={P0:0,P1:1,P2:2},CONFIDENCE={high:0,medium:1,low:2,unknown:3};
const COUNT=new Set(['active_users','new_users','returning_users','registered_users','weekly_core']);
const natural=x=>Number.isSafeInteger(x)&&x>=0;
function rankBusinessQuestions({goal,candidates=[],capabilityIds=[],observedTimings={}}={}){
 if(!Object.hasOwn(GOAL,goal)||!Array.isArray(candidates)||candidates.length>100||
  !Array.isArray(capabilityIds))throw Error('业务问题排序输入无效');
 const authorized=new Set(capabilityIds),rows=candidates.slice(0,30)
  .filter(c=>c&&Object.hasOwn(TOOLS,c.metric)&&Object.hasOwn(PRIORITY,c.priority))
  .map((c,index)=>{
   const tool=authorized.has(TOOLS[c.metric])?TOOLS[c.metric]:null;
   const latency=tool?timingFor(tool,observedTimings):null;
   const confidence=Array.isArray(c.evidenceIds)&&c.evidenceIds.length&&
    Object.hasOwn(CONFIDENCE,c.evidenceConfidence)?c.evidenceConfidence:'unknown';
   return {candidateId:typeof c.id==='string'?c.id:null,metric:c.metric,priority:c.priority,
    goalRelevant:GOAL[goal].has(c.metric),
    // Measured population is not a change in user count, and vice versa.
    affectedUsers:natural(c.affectedUsers)?c.affectedUsers:null,
    observedChangeMagnitude:COUNT.has(c.metric)&&natural(Math.abs(c.absolute))?
     Math.abs(c.absolute):null,
    evidenceConfidence:confidence,authorizedTool:tool,
    observedLatency:latency,queryMonetaryCost:'unknown',index};
  });
 rows.sort((a,b)=>Number(b.goalRelevant)-Number(a.goalRelevant)||
  PRIORITY[a.priority]-PRIORITY[b.priority]||
  (a.affectedUsers!==null&&b.affectedUsers!==null?
    b.affectedUsers-a.affectedUsers:0)||
  (a.metric===b.metric&&a.observedChangeMagnitude!==null&&b.observedChangeMagnitude!==null?
    b.observedChangeMagnitude-a.observedChangeMagnitude:0)||
  (a.evidenceConfidence!=='unknown'&&b.evidenceConfidence!=='unknown'?
    CONFIDENCE[a.evidenceConfidence]-CONFIDENCE[b.evidenceConfidence]:0)||
  (a.authorizedTool&&b.authorizedTool&&a.observedLatency&&b.observedLatency?
    a.observedLatency.medianMs-b.observedLatency.medianMs:0)||
  a.index-b.index);
 return {version:'evidence-question-priority-v1',
  questions:rows.slice(0,8).map(({index,...rest})=>rest),
  warnings:['只有原始报告明确记录的受影响人数才可比较；人数变化量不是受影响人数',
   '未知质量/成本保持未知；有样本的工具耗时仅作为近30天历史观察，并非未来费用、收益或信息增益']};
}
module.exports={rankBusinessQuestions};
