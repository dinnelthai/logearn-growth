const {amountText}=require('./collaborationCosts')
function revenueTotals(costs,revenues){
 const currencies=[...new Set([...costs,...revenues].filter(r=>r.state!=='void').map(r=>r.currency))].sort()
 return currencies.map(currency=>{
  const rs=revenues.filter(r=>r.currency===currency&&r.state==='received'),cs=costs.filter(r=>r.currency===currency&&r.state==='actual')
  const sum=rows=>rows.reduce((v,r)=>v+BigInt(r.amount_minor),0n),gross=sum(rs.filter(r=>r.kind==='income')),refunds=sum(rs.filter(r=>r.kind==='refund')),net=gross-refunds,cost=sum(cs),profit=net-cost
  return {currency,income:amountText(gross,currency),refunds:amountText(refunds,currency),net_revenue:rs.length?amountText(net,currency):null,actual_cost:cs.length?amountText(cost,currency):null,profit:rs.length&&cs.length?amountText(profit,currency):null,roi:rs.length&&cost>0n?Number(profit*10000n/cost)/10000:null,source:'manual',income_entries:rs.length}
 })
}
module.exports={revenueTotals}
