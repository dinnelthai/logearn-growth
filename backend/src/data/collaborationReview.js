const db=require('../db/connection'),remote=require('./hologres'),{memberFacts}=require('./memberMetrics'),{compareFacts}=require('../analytics/operationsComparison')
const {costTotals,amountText}=require('../analytics/collaborationCosts')
function activities(c){return db.prepare('SELECT a.* FROM growth_activities a JOIN crm_collaboration_activities l ON l.activity_id=a.id WHERE l.collaboration_id=? AND a.owner_id=? ORDER BY a.start_at,a.id').all(c.id,c.owner_id)}
function costs(c){return db.prepare('SELECT * FROM crm_collaboration_costs WHERE collaboration_id=? ORDER BY occurred_at,id').all(c.id).map(row=>({...row,amount:amountText(row.amount_minor,row.currency)}))}
function revenues(c){return db.prepare('SELECT * FROM crm_collaboration_revenue WHERE collaboration_id=? ORDER BY occurred_at,id').all(c.id).map(r=>({...r,amount:amountText(r.amount_minor,r.currency)}))}
function financials(c){const ledger=revenues(c);return {revenues:ledger,revenue_totals:require('../analytics/collaborationRevenue').revenueTotals(costs(c),ledger)}}
async function collaborationReview(c){
 const linked=activities(c),ledger=costs(c),base={...financials(c),collaboration:c,activities:linked.map(({settled_result,...a})=>a),costs:ledger,cost_totals:costTotals(ledger),generated_at:Date.now()}
 if(!linked.length)return {...base,available:false,reason:'未关联活动，尚无可统计的固定参与名单',performance:null}
 if(linked.some(a=>a.schedule_state==='scheduled'))return {...base,available:false,pending:true,reason:'关联活动含尚未启动的预约，请启动后再复盘',performance:null}
 if(process.env.ANALYTICS_STORAGE!=='hologres')throw Object.assign(new Error('合作表现需要真实远程数据源'),{status:501})
 const s=await remote.status(),period={start:c.start_at,end:Math.min(c.end_at,Date.now()+1,Date.parse(s.as_of)+1)}
 if(period.end<=period.start)return {...base,available:false,pending:true,reason:'数据截至尚未进入合作周期，请继续观察',performance:null,as_of:s.as_of}
 const specs=linked.map(a=>({id:a.id,name:a.name,start:a.start_at,end:a.cutoff_at,members:db.prepare('SELECT user_id AS id FROM growth_activity_members WHERE activity_id=?').all(a.id)})),ids=[...new Set(specs.flatMap(s=>s.members.map(m=>String(m.id))))]
 if(!specs.some(a=>Math.min(a.end,period.end)>Math.max(a.start,period.start)))return {...base,available:false,reason:'关联活动与已观测合作周期无交集',performance:null,as_of:s.as_of}
 const facts=await memberFacts(s,ids,period),performance=compareFacts(specs,facts,period,s)
 return {...base,available:true,...period,snapshot_id:s.snapshot_id,as_of:s.as_of,performance,errors:facts.errors}
}
module.exports={activities,costs,revenues,financials,collaborationReview}
