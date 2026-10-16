const {runComparison}=require('../data/operationComparison')
module.exports=function mount(router,{db,wrap,fail,drafts}){
 const owner=req=>String(req.user.user_id)
 const get=req=>{const r=db.prepare('SELECT * FROM operation_comparison_reports WHERE id=? AND owner_id=?').get(req.params.id,owner(req));if(!r)fail('对比报告不存在',404);return r}
 const publicReport=r=>({id:r.id,name:r.name,created_at:r.created_at,result:JSON.parse(r.result_json),configuration:JSON.parse(r.configuration_json)})
 router.get('/reports',wrap((req,res)=>{const offset=Number(req.query.offset||0),limit=Number(req.query.limit||20);if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)fail('分页参数无效');res.json({reports:db.prepare('SELECT id,name,created_at FROM operation_comparison_reports WHERE owner_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?').all(owner(req),limit,offset),total:db.prepare('SELECT COUNT(*) AS n FROM operation_comparison_reports WHERE owner_id=?').get(owner(req)).n,offset,limit})}))
 router.get('/reports/:id',wrap((req,res)=>res.json(publicReport(get(req)))))
 router.post('/reports',wrap((req,res)=>{const name=req.body.name;if(typeof name!=='string'||!name.trim()||name.trim().length>80)fail('报告名称须为1–80字');const {configuration,result}=drafts.get(req.body.comparison_id,owner(req));if(!result.union||Object.values(result.errors||{}).some(Boolean))fail('所需来源不完整，请重新计算后再保存',503)
  const id='comparison_'+req.body.comparison_id,existing=db.prepare('SELECT * FROM operation_comparison_reports WHERE id=? AND owner_id=?').get(id,owner(req));if(existing)return res.json(publicReport(existing))
  const now=Date.now();db.prepare('INSERT INTO operation_comparison_reports VALUES(?,?,?,?,?,?)').run(id,owner(req),name.trim(),JSON.stringify(configuration),JSON.stringify(result),now);res.status(201).json(publicReport(db.prepare('SELECT * FROM operation_comparison_reports WHERE id=?').get(id)))
 }))
 router.post('/reports/:id/rerun',wrap(async(req,res)=>{const report=get(req),configuration=JSON.parse(report.configuration_json),result=await runComparison(configuration);res.json({...result,comparison_id:drafts.put(owner(req),configuration,result),original_report_id:report.id})}))
}
