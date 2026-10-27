// Page visitor click-through: each numerator is a subset of its page visitor cohort.
const PAGE_BY_LIST={signals:'signals',trending:'trending',trenches:'trenches',strategy_pnl:'strategies'}
function pageClickRates(users,{start,end,asOf}){
 const rows=[],lists={};let available=false
 for(const [list_type,page_name] of Object.entries(PAGE_BY_LIST)){
  const visitors=new Set(),clicked=new Set();let clicks=0,unmatched=0
  for(const u of users){
   const events=u.events.filter(e=>e.t>=start&&e.t<end&&e.t<=asOf)
   const visits=events.filter(e=>(e.raw_name==='page_viewed'||(!e.raw_name&&e.type==='page_view'))&&(e.properties?.page_name??e.page_name)===page_name)
   if(visits.length){visitors.add(u.id);available=true}
   const hits=events.filter(e=>(e.raw_name==='ranking_token_clicked'||(!e.raw_name&&e.type==='token_click'))&&(e.properties?.list_type??e.list_type)===list_type)
   clicks+=hits.length
   if(visits.length&&hits.length)clicked.add(u.id)
   else unmatched+=hits.length
  }
  const list_key='page-click:'+list_type
  lists[list_key+':visitors']=[...visitors];lists[list_key+':clicked']=[...clicked]
  rows.push({list_type,page_name,visitor_users:visitors.size,clicked_users:clicked.size,clicks,unmatched_clicks:unmatched,rate:visitors.size?clicked.size/visitors.size:null,list_key})
 }
 return {lists,payload:{available,rows}}
}
module.exports={pageClickRates}
