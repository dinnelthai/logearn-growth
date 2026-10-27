const {ownAccounts,attachAccounts,invitedAccounts}=require('../analytics/kolAccounts')
const express=require('express'),db=require('../db/connection'),remote=require('../data/hologres')
const {validatePeriod}=require('../analytics/kolMetrics'),{relationships}=require('../data/kolMetrics'),{parseIds}=require('../analytics/activityMonitor')
const {ageConfiguration,runComparison}=require('../data/operationComparison'),drafts=require('../services/comparisonDrafts')
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
router.post('/compare',wrap(async(req,res)=>{
 if(process.env.ANALYTICS_STORAGE!=='hologres')fail('效果对比需要真实远程数据源',501)
 const body=req.body,{kind,scope='tagged',ids,mode='calendar'}=body,owner=String(req.user.user_id)
 if(!['kol','activity'].includes(kind)||!['tagged','own','invited'].includes(scope)||!['calendar','age'].includes(mode)||mode==='age'&&kind!=='activity')fail('未知对比类型、范围或窗口')
 const period=mode==='calendar'?validatePeriod(body):null
 if(mode==='age'&&![1,7,14].includes(body.age_days))fail('同龄窗口仅支持1、7、14天')
 if(!Array.isArray(ids)||ids.length<2||ids.length>8||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail('请选择2–8个不同对象')
 const sort=body.sort||'analysis_users'
 if(!['users','analysis_users','analysis_events','analysis_rate','trade_users','transactions','volume_usd','volume_per_user'].includes(sort))fail('未知排序指标')
 const objects=ids.map(id=>{const o=db.prepare(kind==='kol'?'SELECT * FROM crm_kols WHERE id=? AND owner_id=?':'SELECT * FROM growth_activities WHERE id=? AND owner_id=?').get(id,owner);if(!o)fail('对比对象不存在或无权访问',404);return kind==='kol'?attachAccounts(db,[o])[0]:o})
 if(kind==='activity'&&objects.some(a=>a.schedule_state==='scheduled'))fail('预约活动尚未固定参与名单，启动后再比较',409)
 let control=[]
 if(body.control_user_ids!=null){if(mode!=='calendar')fail('另选人群目前仅支持统一统计期');const parsed=parseIds(body.control_user_ids);if(!parsed.ids.length||parsed.dirty.length||parsed.invalid.length)fail('对照名单须为有效注册账号ID');control=parsed.ids}
 const s=kind==='kol'&&scope==='invited'&&objects.some(o=>ownAccounts(o).length)?await remote.status():null,relation=s?await relationships(s):null
 let specs=objects.map(o=>{
  let members
  if(kind==='activity')members=db.prepare('SELECT user_id AS id FROM growth_activity_members WHERE activity_id=?').all(o.id)
  else if(scope==='own')members=ownAccounts(o).map(id=>({id}))
  else if(scope==='invited')members=invitedAccounts(o,relation,period.end)
  else members=[...new Set([...db.prepare('SELECT user_id FROM crm_kol_members WHERE kol_id=?').all(o.id).map(m=>m.user_id),...ownAccounts(o)])].map(id=>({id}))
  return {id:o.id,name:o.name,members,...(kind==='kol'&&scope!=='tagged'&&!ownAccounts(o).length?{reason:'尚未关联 LogEarn 账号'}:{}),...(kind==='activity'?{start:o.start_at,end:o.cutoff_at,archived:!!o.archived_at,parent_id:o.parent_id}:{})}
 })
 if(mode==='age')specs=ageConfiguration(specs,body.age_days)
 if(control.length){const excluded=new Set(specs.flatMap(s=>s.members.map(m=>String(m.id)))),members=control.filter(id=>!excluded.has(id)).map(id=>({id}));if(!members.length)fail('另选人群全部与参与名单重叠，请换一批用户');specs.push({id:'control',name:'另选人群（排除参与者）',members,is_control:true,excluded_overlap:control.length-members.length})}
 const configuration={kind,scope,mode,period,age_days:body.age_days??null,specs,membership_as_of:Date.now()}
 const result=await runComparison(configuration,s)
 result.sort=sort;result.rows.sort((a,b)=>{const x=a.total?.[sort],y=b.total?.[sort];return x==null?y==null?a.name.localeCompare(b.name):1:y==null?-1:y-x||a.name.localeCompare(b.name)})
 res.json({...result,comparison_id:drafts.put(owner,configuration,result)})
}))
require('./comparisonReports')(router,{db,wrap,fail,drafts})
module.exports=router
