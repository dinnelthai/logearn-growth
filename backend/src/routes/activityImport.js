const {ownAccounts,attachAccounts,invitedAccounts}=require('../analytics/kolAccounts')
const {relationships}=require('../data/kolMetrics'),remote=require('../data/hologres')
module.exports=function mount(router,{db,wrap,validate,get}){
 router.post('/resolve-addresses',wrap(async(req,res)=>{res.json(await require('../data/addressRoster').resolveAddresses(req.body.addresses))}))
 router.post('/import-kol',wrap(async(req,res)=>{
  const {kol_id,scope='tagged'}=req.body,row=db.prepare('SELECT * FROM crm_kols WHERE id=? AND owner_id=?').get(String(kol_id),String(req.user.user_id))
  const kol=row?attachAccounts(db,[row])[0]:null
  if(!kol)throw Object.assign(new Error('KOL不存在'),{status:404})
  if(!['tagged','own','invited'].includes(scope))throw Object.assign(new Error('未知KOL名单范围'),{status:400})
  if(scope!=='tagged'&&!ownAccounts(kol).length)throw Object.assign(new Error('尚未关联KOL本人账号，无法读取此范围'),{status:409})
  const snapshot=scope==='invited'?await remote.status():null,relation=snapshot?await relationships(snapshot):null
  const ids=scope==='own'?ownAccounts(kol):scope==='invited'?invitedAccounts(kol,relation).filter(m=>m.bound_at<=Date.now()&&m.bound_at<=Date.parse(snapshot.as_of||snapshot.snapshot_cutoff)).map(m=>String(m.id)):[...db.prepare('SELECT user_id FROM crm_kol_members WHERE kol_id=?').all(kol.id).map(m=>m.user_id),...ownAccounts(kol)]
  const unique=[...new Set(ids)];if(unique.length>5000)throw Object.assign(new Error('来源超过5000人，请先在分群缩小名单'),{status:422})
  res.json({user_ids:unique,title:kol.name+' · '+{tagged:'标签名单',own:'本人',invited:'有效直接邀请'}[scope],fixed_at:Date.now(),snapshot_id:snapshot?.snapshot_id??null})
 }))
 router.post('/:id/validate-batch',wrap(async(req,res)=>{
  const current=get(req.params.id,req.user.user_id),root=current.parent_id?get(current.parent_id,req.user.user_id):current,v=await validate(req.body.user_ids)
  const existing=new Set(db.prepare('SELECT m.user_id FROM growth_activity_members m JOIN growth_activities a ON a.id=m.activity_id WHERE a.owner_id=? AND (a.id=? OR a.parent_id=?)').all(root.owner_id,root.id,root.id).map(m=>m.user_id))
  const rows=v.rows.filter(r=>!existing.has(r.user_id)),now=Date.now()
  res.json({...v.report,matched:rows.length,prior:rows.filter(r=>r.baseline_first_at!=null&&Number(r.baseline_first_at)<now).length,eligible:rows.filter(r=>r.baseline_first_at==null||Number(r.baseline_first_at)>=now).length,skipped_existing:v.rows.length-rows.length})
 }))
}
