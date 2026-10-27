// Preserve source order: deduplication of conflicting IDs must keep the same winner.
function createMemberFactSelector(facts){
 const index=(rows,key)=>{
  const groups=new Map()
  rows.forEach((row,position)=>{const id=String(row[key]);if(!groups.has(id))groups.set(id,[]);groups.get(id).push([position,row])})
  return groups
 }
 const events=index(facts.events,'user_id'),trades=index(facts.trades,'account_id')
 return members=>{
  const ids=new Set(members.map(m=>String(m.id)))
  const collect=groups=>{
   const selected=[]
   for(const id of ids)for(const row of groups.get(id)||[])selected.push(row)
   selected.sort((a,b)=>a[0]-b[0])
   return selected.map(([,row])=>row)
  }
  return {...facts,events:collect(events),trades:collect(trades)}
 }
}
module.exports={createMemberFactSelector}
