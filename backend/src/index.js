require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true })
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const db = require('./db/connection')
const seedAdmin = require('./db/seed')
const authRouter = require('./routes/auth')
const cohortsRouter = require('./routes/cohorts')
const savedConfigsRouter = require('./routes/savedConfigs')
const analyticsRouter = require('./routes/analytics')
const metricsRouter = require('./routes/metrics')
const drillRouter = require('./routes/drill')
const requireAuth = require('./middleware/requireAuth')

// Run migrations on startup
const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8')
db.exec(schema)

require('./db/upgradeActivities').upgradeActivities(db)
require('./db/upgradeActivities').upgradeCohorts(db)
require('./db/mergeActivityBatches').mergeActivityBatches(db)
require('./db/upgradeKolAccounts').upgradeKolAccounts(db)
require('./services/activitySchedule').startScheduler()
require('./services/platformAssets').start()

// 启动每日预聚合刷新任务 (如果启用)
if (process.env.ENABLE_DAILY_ROLLUP !== 'false') {
  require('./workers/dailyRollupRefresh').startScheduledRefresh()
}

// 启动物化视图刷新任务 (如果启用)
if (process.env.ENABLE_MATERIALIZED_VIEWS === 'true') {
  require('./workers/materializedViewRefresh').startScheduledRefresh()
}

// Seed default admin if no users exist
seedAdmin().catch(console.error)

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',').map(s => s.trim())
    if (!origin || allowed.includes(origin)) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '2mb' }))

// Health check (public)
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// Prometheus metrics endpoint (public, for monitoring tools)
app.get('/metrics', require('./monitoring/prometheus').handler)

// Auth routes (login is public, rest require auth internally)
app.use('/api/auth', authRouter)

app.use('/api/user-crm',requireAuth,require('./routes/userCrm'))

app.use(['/api/users','/api/user-followups','/api/workbench'],requireAuth)
app.use(require('./routes/userOperations'))

// Remote priority analytics routes precede SQLite routes; no silent local fallback.
if (process.env.ANALYTICS_STORAGE === 'hologres') {
  app.use(['/api/analytics', '/api/metrics', '/api/drill', '/api/events'], requireAuth)
  app.use(require('./routes/remoteAnalytics'))
}

// Batch analytics (优化: 单次请求获取多个指标)
app.use('/api/batch-analytics', requireAuth, require('./routes/batchAnalytics'))

// System metrics (缓存统计、内存占用等)
app.use('/api/system/metrics', requireAuth, require('./routes/metrics'))

// Rollup analytics (预聚合数据查询，快速访问)
app.use('/api/rollup', requireAuth, require('./routes/rollup'))

// Protected routes
app.use('/api/promotions',requireAuth,require('./routes/promotions'))
app.use('/api/operation-tasks', requireAuth, require('./routes/operationTasks'))
app.use('/api/operations', requireAuth, require('./routes/operationsComparison'))
app.use('/api/activities', requireAuth, require('./routes/activities'))
app.use('/api/ops',requireAuth,require('./routes/ops'))
app.use('/api/growth-reports',requireAuth,require('./routes/growthReports'))
app.use('/api/crm/kols', requireAuth, require('./routes/crm'))
app.get('/api/user-tags',requireAuth,(req,res,next)=>{try{res.json({tags:require('./analytics/userTags').userTags(req.user.user_id,{includeMembers:false}).map(({user_ids,...tag})=>tag)})}catch(e){next(e)}})
app.post('/api/user-tags/audience',requireAuth,async(req,res,next)=>{
  try{
    const {userTags,resolveTags}=require('./analytics/userTags'),{start,end}=require('./analytics/kolMetrics').validatePeriod(req.body)
    if(!Array.isArray(req.body.tag_ids)||!req.body.tag_ids.length)throw Object.assign(new Error('请至少选择一个活动或 KOL 标签'),{status:400})
    let existing=req.body.audience_ids
    if(existing!=null&&(!Array.isArray(existing)||existing.length>50000||existing.some(id=>typeof id!=='string')))throw Object.assign(new Error('原人群格式无效'),{status:400})
    if(req.body.cohort_id){
      const cohort=db.prepare('SELECT id,kind FROM cohorts WHERE id=? AND created_by=? AND is_deleted=0').get(String(req.body.cohort_id),String(req.user.user_id))
      if(!cohort)throw Object.assign(new Error('用户群组不存在或无权访问'),{status:404})
      if(cohort.kind==='dynamic')throw Object.assign(new Error('动态人群需先重新计算并使用固定名单'),{status:409})
      const cohortIds=db.prepare('SELECT user_id FROM cohort_members WHERE cohort_id=?').all(String(req.body.cohort_id)).map(r=>'user:'+String(r.user_id).replace(/^user:/,'')),allowed=new Set(cohortIds)
      existing=existing==null?cohortIds:existing.filter(id=>allowed.has(id))
    }
    const tags=userTags(req.user.user_id,{tagIds:req.body.tag_ids}),ids=resolveTags(tags,req.body.tag_ids,req.body.tag_mode||'all',existing??null)
    const remote=require('./data/hologres'),s=req.body.snapshot_id?await remote.snapshot(String(req.body.snapshot_id)):await remote.status()
    res.json({ids,count:ids.length,start,end,snapshot_id:s.snapshot_id,as_of:s.as_of,title:tags.filter(t=>req.body.tag_ids.includes(t.id)).map(t=>(t.type==='activity'?'活动：':'KOL：')+t.name).join(' + '),description:(req.body.tag_mode==='any'?'拥有任一所选标签':'同时拥有所选标签')+' · 应用时固定名单',source:req.body.source||'all',origin:'tags'})
  }catch(e){next(e)}
})
app.use('/api',requireAuth,require('./routes/audienceHistory'))
app.use('/api/cohorts', requireAuth, cohortsRouter)
app.use('/api/saved-configs', savedConfigsRouter)
app.use('/api/events', requireAuth, analyticsRouter)
app.use('/api/analytics', requireAuth, analyticsRouter)
app.use('/api/metrics', requireAuth, metricsRouter)
app.use('/api/drill', requireAuth, drillRouter)

app.use('/api/platform-assets', requireAuth, require('./routes/platformAssets'))

// 404
app.use((req, res) => res.status(404).json({ error: '接口不存在' }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(err.status || 503).json({ error: err.status ? err.message : '数据查询失败，请稍后重试' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
