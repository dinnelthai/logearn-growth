const express = require('express')
const remote = require('../data/hologres')
const router = express.Router()
const {ANALYSIS_SQL,D7_SQL}=require('../data/analysisUsers')
const {userFactsCte}=require('../data/userFacts')
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next)
function range(input) {
  const start = Number(input.start), end = Number(input.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 86400000)
    throw Object.assign(new Error('请提供有效日期范围，最长366天'), { status: 400 })
  return { start, end }
}
function date(ms) { return new Date(ms + 7 * 3600000).toISOString().slice(0, 10) }
function metadata(s) { return { snapshot_id: s.snapshot_id, as_of: s.as_of, computed_at: new Date().toISOString(),
  source_seen_at: s.source_seen_at, consistency: s.consistency, history_complete: false } }
router.get(['/api/analytics/meta', '/api/analytics/status'], wrap(async (_req, res) => res.json(await remote.status())))
router.post('/api/analytics/refresh', wrap(async (_req,res)=>res.json(await remote.status(true))))
router.get('/api/metrics/my-monitor',wrap(async(req,res)=>{
 const {start,end}=range(req.query),s=req.query.snapshot_id?await remote.snapshot(String(req.query.snapshot_id)):await remote.status()
 const result=await remote.cached(JSON.stringify(['my-monitor',s.snapshot_id,start,end]),()=>require('../data/myMonitor').myMonitor(s,{start,end}))
 res.json({...result,meta:{...result.meta,snapshot_id:s.snapshot_id}})
}))
router.get('/api/metrics/trade-volume',wrap(async(req,res)=>{
 const {start,end}=range(req.query),s=req.query.snapshot_id?await remote.snapshot(String(req.query.snapshot_id)):await remote.status()
 res.json(await remote.cached(JSON.stringify(['trade-volume',s.snapshot_id,start,end]),()=>require('../data/tradeVolume').tradeVolume(s,{start,end})))
}))
router.get('/api/metrics/north-star', wrap(async (req, res) => {
  const {start, end} = range(req.query), source = req.query.source && req.query.source !== 'all' ? String(req.query.source) : null
  const s = req.query.snapshot_id?await remote.snapshot(String(req.query.snapshot_id)):await remote.status()
  const result = await remote.cached(JSON.stringify(['north', s.snapshot_id, start, end, source]), async () => {
    const cte = remote.eventsCte()
    const params = [s.snapshot_cutoff, start, end, source]
    const [days, summary, d7Eligible] = await Promise.all([
      remote.query(`${cte} SELECT e.date,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL})) AS active_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND
          TO_CHAR(TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') = e.date) AS new_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND
          TO_CHAR(TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') < e.date) AS returning_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND ${D7_SQL}) AS d7_users,
        COUNT(DISTINCT e.user_id) FILTER (WHERE NULLIF(BTRIM(e.user_id),'') IS NOT NULL) AS login_users,
        COUNT(*) FILTER (WHERE event_name IN (${ANALYSIS_SQL})) AS chip_events
        FROM e JOIN facts f ON f.user_key=e.user_key WHERE client_ts >= $2 AND client_ts < $3
          AND ($4::text IS NULL OR f.source=$4) GROUP BY e.date ORDER BY e.date`, params),
      remote.query(`${cte} SELECT COUNT(DISTINCT e.user_key) AS active_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE f.first_chip >= $2) AS new_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE f.first_chip < $2) AS returning_users
        FROM e JOIN facts f ON f.user_key=e.user_key
        WHERE event_name IN (${ANALYSIS_SQL}) AND client_ts >= $2 AND client_ts < $3
          AND ($4::text IS NULL OR f.source=$4)`, params),
      remote.query(`${cte} SELECT TO_CHAR((TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok')::date + 7,'YYYY-MM-DD') AS date, COUNT(*) AS users
        FROM facts f WHERE f.first_chip >= $2::bigint-604800000 AND f.first_chip < $3::bigint-604800000
        AND ($4::text IS NULL OR f.source=$4) GROUP BY 1`,params),
    ])
    const eligibleByDate=new Map(d7Eligible.map(r=>[r.date,Number(r.users)]))
    const byDate = new Map(days.map(d => [d.date, d])), filled = []
    for (let t = start; t < end; t += 86400000) {
      const day = date(t), raw = byDate.get(day) || {}, item = {date: day}
      for (const field of ['active_users','new_users','returning_users','login_users','chip_events']) item[field] = Number(raw[field] || 0)
      item.d7_eligible_users=eligibleByDate.get(day)||0
      item.d7_users=item.d7_eligible_users?Number(raw.d7_users||0):null
      filled.push(item)
    }
    const totals = Object.fromEntries(Object.entries(summary[0]).map(([k,v]) => [k, Number(v)]))
    return { days: filled, totals: {...totals, days: filled.length, avg_daa: filled.reduce((n,d)=>n+d.active_users,0)/filled.length},
      meta: metadata(s), coverage: {events: 'partial', trades: 'unknown'}, drill: {snapshot_id: s.snapshot_id} }
  })
  res.json(result)
}))
const jobs=require('../services/analysisJobs')
const {resolveAudienceUserIds}=require('../analytics/loadUsers')
router.post('/api/analytics/audience',wrap(async(req,res)=>{
 const {cache_id,list_key,q}=req.body,{j,value}=jobs.result(cache_id,req.user.user_id)
 const s=await remote.snapshot(j.snapshot),ids=require('../analytics/taskAudience').cachedAudience(value,list_key,q)
 res.json({ids,start:value.payload.start??j.context.start,end:value.payload.end??j.context.end,source:j.context.source,origin:j.context.mode,snapshot_id:j.snapshot,as_of:s.as_of,count:ids.length})
}))
const {ASSOCIATIONS}=require('../analytics/funnel')
const {TYPE_TO_RAWS}=require('../analytics/eventMap')
for(const kind of ['funnel','retention','segments','referral','paths','trade-monitor','channels','login-conversion','invite-conversion']){
  router.post('/api/metrics/'+kind,wrap(async(req,res)=>{
    const body={...req.body};delete body.resolving_cohort_rule
    let resolving=null
    if(kind==='segments'&&body.resolving_cohort_id){
      resolving=require('../db/connection').prepare('SELECT * FROM cohorts WHERE id=? AND created_by=? AND is_deleted=0 AND kind=?').get(String(body.resolving_cohort_id),String(req.user.user_id),'dynamic')
      if(!resolving)return res.status(404).json({error:'动态人群不存在'})
      const r=JSON.parse(resolving.rule_json);Object.assign(body,{filters:r.filters,pool:r.pool,source:r.source,tag_ids:r.tag_ids,tag_mode:r.tag_mode,audience_ids:r.base_ids,cohort_id:null,resolving_cohort_rule:resolving.rule_json})
    }
    if(kind!=='segments'||body.start!=null||body.end!=null)Object.assign(body,range(body))
    if(['login-conversion','invite-conversion'].includes(kind))require('../analytics/loginConversion').validateConversion(body)
    if(kind==='channels')require('../analytics/channelInsights').validateChannels(body)
    if(kind==='paths')require('../analytics/pathInsights').validatePaths(body)
    if(kind==='trade-monitor')require('../analytics/tradeInsights').validateTrade(body)
    if(kind==='referral')require('../analytics/referralInsights').validateReferral(body)
    if(kind==='segments')require('../analytics/segmentInsights').validateOptions(body)
    if(kind==='funnel'){
      if(!Array.isArray(body.steps)||body.steps.length<2||body.steps.length>5||body.steps.some(x=>!['daily_visit','logged_in_visit'].includes(x)&&!TYPE_TO_RAWS[x]))
        return res.status(400).json({error:'请提供2至5个有效漏斗步骤'})
      if(!Object.hasOwn(ASSOCIATIONS,body.association||'user'))return res.status(400).json({error:'未知关联模式'})
      if(body.hours!=null&&![1,24,72].includes(Number(body.hours)))return res.status(400).json({error:'转化窗口仅支持1/24/72小时'})
    }
    if(kind==='retention')require('../analytics/retentionCurves').validateRetention(body)
    if(kind==='retention'&&[body.initial||'chip',body.returning||'chip'].some(x=>!['daily_visit','logged_in_visit'].includes(x)&&!TYPE_TO_RAWS[x]))
      return res.status(400).json({error:'未知留存行为'})
    const s=body.snapshot_id?await remote.snapshot(String(body.snapshot_id)):await remote.status()
    if(resolving){const r=JSON.parse(resolving.rule_json);body.end=Date.parse(s.as_of)+1;body.start=Math.floor((body.end+25200000)/86400000)*86400000-25200000-(r.days-1)*86400000}
    // Cohort state is local app state, but event membership is queried remotely.
    if(Array.isArray(body.audience_ids)&&body.audience_ids.length>50000)return res.status(422).json({error:'人群过大'})
    let audience=resolveAudienceUserIds(body,req.user.user_id)
    if(Array.isArray(body.audience_ids)&&!body.audience_ids.length&&!body.cohort_id)audience=[]
    if(audience)audience=audience.map(id=>String(id).startsWith('anonymous:')?id:'user:'+String(id).replace(/^user:/,''))
    if(kind==='segments'){
      const {userTags,resolveTags}=require('../analytics/userTags'),tags=userTags(req.user.user_id,{tagIds:body.tag_ids||[]})
      audience=resolveTags(tags,body.tag_ids||[],body.tag_mode||'any',audience)
      // Capture current local tag membership in the job; never accept a client-supplied snapshot.
      body.user_tag_snapshot=tags
      const rights=require('../db/connection').prepare('SELECT user_key,kind,starts_at,expires_at,revoked_at FROM ops_entitlements WHERE owner_id=? LIMIT 50001').all(String(req.user.user_id));if(rights.length>50000)return res.status(422).json({error:'权益记录超过分析预算'});body.entitlement_snapshot=rights.map(e=>({...e,state:require('../services/userCrm').state(e,Date.parse(s.snapshot_cutoff))}))
      body.user_tag_catalog=userTags(req.user.user_id,{includeMembers:false})
    }
    const j=jobs.start(kind,body,s,audience,req.user.user_id)
    if(j.state==='failed')return res.status(j.status).json({error:j.error})
    if(j.state==='complete')return res.json(jobPayload(j,req.user.user_id))
    res.status(202).json({job_id:j.id,state:j.state})
  }))
}
function jobPayload(j,owner){
  const {value}=jobs.result(j.id,owner)
  return {...value.payload,meta:{snapshot_id:j.snapshot,history_complete:false,user_pool:value.payload.user_pool||'observed',facts_as_of:value.payload.facts_as_of||null},
    coverage:{events:'partial',trades:'unknown'},drill:{cache_id:j.id,snapshot_id:j.snapshot}}
}
router.get('/api/analytics/jobs/:id',wrap(async(req,res)=>{
  const j=jobs.get(req.params.id,req.user.user_id)
  if(j.state==='failed')return res.status(j.status).json({error:j.error})
  if(j.state==='complete')return res.json(jobPayload(j,req.user.user_id))
  res.status(202).json({job_id:j.id,state:j.state})
}))
router.post('/api/drill/users', wrap(async (req, res) => {
  const {kind, params = {}, q = ''} = req.body || {}
  if(kind==='cached_list'){
    const {j,value}=jobs.result(params.cache_id,req.user.user_id)
    const ids=require('../analytics/retentionCurves').resolveCachedList(value,params.list_key)
    if(!Array.isArray(ids))return res.status(400).json({error:'未知下钻名单'})
    const s=await remote.snapshot(j.snapshot),limit=Math.min(200,Math.max(1,Number(req.body.limit)||50)),offset=Math.max(0,Number(req.body.offset)||0)
    if(value.members){
      const search=String(q).slice(0,128).toLowerCase(),rows=ids.map(id=>value.members[id]).filter(Boolean).filter(r=>!search||(value.search_fields||['id','source','inviter_id','invitee_id','reason']).map(k=>r[k]).some(x=>String(x??'').toLowerCase().includes(search))).sort((a,b)=>a.id.localeCompare(b.id))
      return res.json({rows:rows.slice(offset,offset+limit),total:rows.length,offset,limit,meta:metadata(s)})
    }
    const rows=await remote.query(`${remote.eventsCte()}${userFactsCte()}, members AS (
      SELECT user_key AS id,COALESCE(source,'未知') AS source FROM (SELECT user_key,source FROM product_users UNION ALL SELECT user_key,source FROM facts WHERE user_key LIKE 'anonymous:%') pool WHERE user_key=ANY($2::text[])
      AND ($3::text='' OR POSITION(LOWER($3) IN LOWER(user_key))>0 OR POSITION(LOWER($3) IN LOWER(COALESCE(source,'')))>0))
      SELECT *,COUNT(*) OVER() AS total FROM members ORDER BY id LIMIT $4 OFFSET $5`,
      [s.snapshot_cutoff,ids,String(q).slice(0,128),limit,offset])
    const total=rows.length?Number(rows[0].total):Number((await remote.query(`${remote.eventsCte()}${userFactsCte()} SELECT COUNT(*) AS n FROM (SELECT user_key,source FROM product_users UNION ALL SELECT user_key,source FROM facts WHERE user_key LIKE 'anonymous:%') pool
      WHERE user_key=ANY($2::text[]) AND ($3::text='' OR POSITION(LOWER($3) IN LOWER(user_key))>0
      OR POSITION(LOWER($3) IN LOWER(COALESCE(source,'')))>0)`,[s.snapshot_cutoff,ids,String(q).slice(0,128)]))[0].n)
    return res.json({rows:rows.map(({total,...rest})=>({...rest,...require('../analytics/compactDetails').expandDetails(value,rest.id)})),total,offset,limit,meta:metadata(s)})
  }
  const s = await remote.snapshot(params.snapshot_id)
  let start = params.start, end = params.end
  if (params.date) { start = Date.parse(`${params.date}T00:00:00+07:00`); end = start + 86400000 }
  ;({start, end} = range({start, end}))
  if (!['north_star_period','north_star_day','north_star_login_day'].includes(kind))
    return res.status(400).json({error: '此下钻尚未迁移到远程查询'})
  const offset = Math.min(100000, Math.max(0, Number(req.body.offset) || 0)), limit = Math.min(200, Math.max(1, Number(req.body.limit) || 50))
  const source = params.source && params.source !== 'all' ? params.source : null
  const cohort = params.cohort || 'active'
  let condition = kind === 'north_star_login_day' ? "NULLIF(BTRIM(e.user_id),'') IS NOT NULL" : `event_name IN (${ANALYSIS_SQL})`
  if (cohort === 'new') condition += kind === 'north_star_day' ? ' AND f.first_chip >= $2 AND f.first_chip < $3' : ' AND f.first_chip >= $2'
  if (cohort === 'd7') condition += ` AND ${D7_SQL}`
  if (cohort === 'returning') condition += ' AND f.first_chip < $2'
  const cte = `${remote.eventsCte()}, members AS (SELECT DISTINCT e.user_key AS id, COALESCE(f.source,'未知') AS source
    FROM e JOIN facts f ON f.user_key=e.user_key WHERE client_ts >= $2 AND client_ts < $3 AND ${condition}
    AND ($4::text IS NULL OR f.source=$4) AND ($5::text='' OR POSITION(LOWER($5) IN LOWER(e.user_key))>0
      OR POSITION(LOWER($5) IN LOWER(COALESCE(f.source,'')))>0))`
  const values = [s.snapshot_cutoff, start, end, source, String(q).slice(0,128)]
  const [rows, counts] = await Promise.all([
    remote.query(`${cte} SELECT * FROM members ORDER BY id LIMIT $6 OFFSET $7`, [...values, limit, offset]),
    remote.query(`${cte} SELECT COUNT(*) AS n FROM members`, values),
  ])
  res.json({rows, total: Number(counts[0].n), offset, limit, meta: metadata(s)})
}))
router.get('/api/drill/timeline', wrap(async (req, res) => {
  const id = String(req.query.user_id || ''), snapshotId=req.query.cache_id?jobs.get(req.query.cache_id,req.user.user_id).snapshot:req.query.snapshot_id, s = await remote.snapshot(snapshotId)
  if (!/^(user|anonymous):.+/.test(id)) return res.status(400).json({error: '无效用户ID'})
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
  const start = req.query.start == null ? 0 : Number(req.query.start), end = req.query.end == null ? Number.MAX_SAFE_INTEGER : Number(req.query.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return res.status(400).json({error:'无效时间范围'})
  const events = await remote.query(`${remote.eventsCte()} SELECT event_id,event_name,client_ts AS t,session_id,
    first_entry_source AS entry_source, COALESCE(properties->>'chain',chain) AS chain,properties
    FROM e WHERE user_key=$2 AND client_ts >= $3 AND client_ts < $4 ORDER BY client_ts,event_id LIMIT $5`,
    [s.snapshot_cutoff, id, start, end, limit])
  res.json({user:{id}, events:events.map(e=>({...e,t:Number(e.t)})),meta:metadata(s)})
}))
router.use(['/api/metrics','/api/drill','/api/analytics','/api/events'], (_req, res) =>
  res.status(501).json({error:'该分析尚未迁移到远程模式；请使用已接入的北极星页面'}))
module.exports = router
