const express=require('express'),{randomUUID}=require('node:crypto'),db=require('../db/connection'),remote=require('../data/hologres'),{promotionUrl,attributeTouches}=require('../analytics/promotionAttribution'),{validatePeriod}=require('../analytics/kolMetrics'),{memberFacts,memberMetrics,budget}=require('../data/memberMetrics')
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next),fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
function links(owner){return db.prepare('SELECT * FROM promotion_links WHERE owner_id=? ORDER BY created_at DESC,id').all(String(owner))}
router.get('/',wrap((req,res)=>{res.json({links:links(req.user.user_id).filter(l=>(!req.query.kol_id||l.kol_id===req.query.kol_id)&&(!req.query.activity_id||l.activity_id===req.query.activity_id))})}))
router.post('/',wrap((req,res)=>{
 const b=req.body,owner=String(req.user.user_id),id='pl_'+randomUUID()
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||(!b.kol_id&&!b.activity_id))fail('请填写链接名称并关联KOL或活动')
 for(const [key,table]of [['kol_id','crm_kols'],['activity_id','growth_activities']])if(b[key]&& !db.prepare(`SELECT id FROM ${table} WHERE id=? AND owner_id=?`).get(String(b[key]),owner))fail('关联对象不存在',404)
 if(links(owner).length>=500)fail('最多保存500条推广链接',422)
 const url=promotionUrl(b.url,id,b),at=Date.now();db.prepare('INSERT INTO promotion_links VALUES(?,?,?,?,?,?,?)').run(id,owner,b.kol_id||null,b.activity_id||null,b.name.trim(),url,at)
 res.status(201).json({link:links(owner).find(l=>l.id===id)})
}))
router.post('/:id/report',wrap(async(req,res)=>{
 const owner=String(req.user.user_id),catalog=links(owner),link=catalog.find(l=>l.id===req.params.id);if(!link)fail('推广链接不存在',404)
 const period=validatePeriod(req.body);if(process.env.ANALYTICS_STORAGE!=='hologres')fail('推广归因需要远程事件源',501)
 const s=await remote.status(),rows=budget(await remote.query(`${remote.eventsCte()} SELECT event_id,user_key,client_ts AS t,COALESCE(properties->>'page_url',page) AS url FROM e WHERE client_ts>=$2 AND client_ts<$3 AND COALESCE(properties->>'page_url',page) LIKE '%le_link=%' ORDER BY client_ts,event_id LIMIT 150001`,[s.snapshot_cutoff,period.start,period.end]),150000,'推广触点')
 const touches=attributeTouches(rows,catalog).filter(t=>t.id===link.id),members=touches.filter(t=>/^user:[1-9]\d{0,19}$/.test(t.user_key)).map(t=>({id:t.user_key.slice(5),bound_at:t.t})),facts=await memberFacts(s,members.map(m=>m.id),period)
 const first=new Map(members.map(m=>[m.id,m.bound_at]));facts.events=facts.events.filter(e=>Number(e.t)>=first.get(String(e.user_id)));facts.trades=facts.trades.filter(t=>Date.parse(t.transaction_time)>=first.get(String(t.account_id)))
 res.json({link,...period,snapshot_id:s.snapshot_id,as_of:s.as_of,observed_visitors:touches.length,anonymous_visitors:touches.length-members.length,performance:memberMetrics(facts,members,period,s),errors:facts.errors,model:'first_observed_owner_link_in_period',note:'所选期间内，按当前账号推广链接首次已观测触点归组；仅计触点后行为。匿名与注册身份使用唯一已验证事件关联。不是确认新增获客或因果贡献。'})
}))
module.exports=router
