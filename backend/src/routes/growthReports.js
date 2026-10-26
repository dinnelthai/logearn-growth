const express=require('express'),{randomUUID}=require('node:crypto'),db=require('../db/connection'),jobs=require('../services/analysisJobs')
const router=express.Router(),owner=req=>String(req.user.user_id)
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)
db.exec(`CREATE TABLE IF NOT EXISTS growth_analysis_reports (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL,
 configuration_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS growth_analysis_reports_owner ON growth_analysis_reports(owner_id,created_at);`)
router.get('/',wrap((req,res)=>res.json({reports:db.prepare('SELECT id,title,note,created_at FROM growth_analysis_reports WHERE owner_id=? ORDER BY created_at DESC,id LIMIT 30').all(owner(req))})))
router.post('/',wrap(async(req,res)=>{
 const {title,note='',cache_id}=req.body
 if(typeof title!=='string'||!title.trim()||title.length>80||typeof note!=='string'||note.length>4000)
   return res.status(400).json({error:'标题须为1–80字，结论须为4000字以内文本'})
 const {j,value}=jobs.result(cache_id,req.user.user_id)
 if(j.context.mode!=='growth-insights')return res.status(400).json({error:'请先运行增长诊断再保存报告'})
 const id='growth_'+randomUUID(),configuration={...j.context,snapshot_id:j.snapshot,definition_version:2}
 // Save the authoritative result, including the exact lists; never trust a browser's metrics.
 db.prepare('INSERT INTO growth_analysis_reports VALUES(?,?,?,?,?,?,?)').run(id,owner(req),title.trim(),note,JSON.stringify(configuration),JSON.stringify(value),Date.now())
 res.status(201).json({id})
}))
router.get('/:id',wrap((req,res)=>{
 const r=db.prepare('SELECT * FROM growth_analysis_reports WHERE id=? AND owner_id=?').get(String(req.params.id),owner(req))
 if(!r)return res.status(404).json({error:'增长报告不存在'})
 res.json({id:r.id,title:r.title,note:r.note,created_at:r.created_at,configuration:JSON.parse(r.configuration_json),result:JSON.parse(r.result_json)})
}))
module.exports=router
