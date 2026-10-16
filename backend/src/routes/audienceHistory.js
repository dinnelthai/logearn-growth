const express=require('express'),db=require('../db/connection'),{randomUUID}=require('node:crypto'),jobs=require('../services/analysisJobs')
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
function cohort(req){const c=db.prepare('SELECT * FROM cohorts WHERE id=? AND created_by=? AND is_deleted=0').get(req.params.id,String(req.user.user_id));if(!c)fail('人群不存在',404);return c}
router.get('/user-tags/history',wrap((req,res)=>{
 const offset=Number(req.query.offset||0);if(!Number.isInteger(offset)||offset<0)fail('分页无效')
 const tag=req.query.tag_id||null,user=req.query.user_id||null,owner=String(req.user.user_id),where='owner_id=? AND (? IS NULL OR tag_id=?) AND (? IS NULL OR user_id=?)',args=[owner,tag,tag,user,user]
 const rows=db.prepare(`SELECT * FROM audience_tag_history WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`).all(...args,offset)
 const catalog=require('../analytics/userTags').userTags(owner,{includeMembers:false}),names=new Map(catalog.map(t=>[t.id,t.name]))
 res.json({history:rows.map(r=>({...r,name:names.get(r.tag_id)||r.tag_id})),total:db.prepare(`SELECT COUNT(*) AS n FROM audience_tag_history WHERE ${where}`).get(...args).n,offset,limit:50})
}))
router.get('/cohorts/:id/versions',wrap((req,res)=>{
 const c=cohort(req),offset=Number(req.query.offset||0);if(!Number.isInteger(offset)||offset<0)fail('分页无效')
 const versions=db.prepare('SELECT * FROM cohort_versions WHERE cohort_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?').all(c.id,offset)
 res.json({versions:versions.map(({members_json,context_json,...v})=>({...v,count:JSON.parse(members_json).length,context:JSON.parse(context_json)})),total:db.prepare('SELECT COUNT(*) AS n FROM cohort_versions WHERE cohort_id=?').get(c.id).n})
}))
router.get('/cohorts/:id/versions/:version',wrap((req,res)=>{
 cohort(req);const v=db.prepare('SELECT * FROM cohort_versions WHERE cohort_id=? AND id=?').get(req.params.id,req.params.version);if(!v)fail('人群版本不存在',404)
 res.json({id:v.id,ids:JSON.parse(v.members_json),context:JSON.parse(v.context_json),created_at:v.created_at})
}))
router.post('/cohorts/:id/versions',wrap((req,res)=>{
 const c=cohort(req);let ids,context,job=null
 if(c.kind==='dynamic'){
  job=String(req.body.cache_id||'');const {j,value}=jobs.result(job,req.user.user_id)
  if(j.context.mode!=='segments'||j.context.cohort_id!==c.id||j.context.cohort_rule!==c.rule_json)fail('请重新计算该动态人群后保存版本',409)
  ids=[...new Set(value.lists.all||[])];context={...j.context,snapshot_id:j.snapshot}
 }else {ids=db.prepare('SELECT user_id FROM cohort_members WHERE cohort_id=? ORDER BY user_id').all(c.id).map(r=>/^(user:|anonymous:)/.test(r.user_id)?r.user_id:'user:'+r.user_id);context={kind:'static',updated_at:c.updated_at}}
 if(ids.length>50000||ids.some(id=>typeof id!=='string'||!/^(user:|anonymous:).+$/.test(id)))fail('人群名单无效或超过50000人')
 const previous=db.prepare('SELECT members_json FROM cohort_versions WHERE cohort_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(c.id),old=new Set(previous?JSON.parse(previous.members_json):[]),current=new Set(ids)
 context={...context,added:ids.filter(id=>!old.has(id)).length,removed:[...old].filter(id=>!current.has(id)).length,previous_count:previous?old.size:null}
 const id='cv_'+randomUUID(),last=db.prepare('SELECT MAX(created_at) AS at FROM cohort_versions WHERE cohort_id=?').get(c.id),at=Math.max(Date.now(),(last.at||0)+1);db.prepare('INSERT OR IGNORE INTO cohort_versions VALUES(?,?,?,?,?,?)').run(id,c.id,job,JSON.stringify(ids),JSON.stringify(context),at)
 const saved=job?db.prepare('SELECT id FROM cohort_versions WHERE cohort_id=? AND origin_job=?').get(c.id,job):{id}
 res.status(201).json({id:saved.id,count:ids.length,...context})
}))
module.exports=router
