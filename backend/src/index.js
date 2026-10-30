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
require('./services/xAcquisition').service().start()

require('./pathIndex/service').start()

// Daily rollups remain disabled; the versioned path index preserves event semantics.

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

// Google authorization code arrives without the LogEarn bearer header.
// Ownership is resolved only after consuming one-time server-side state.
app.use('/api/gsc', require('./routes/gscOAuthCallback'))
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

// System metrics (缓存统计、内存占用等)
app.use('/api/system/metrics', requireAuth, require('./routes/systemMetrics'))


// Protected routes
app.use('/api/promotions',requireAuth,require('./routes/promotions'))
app.use('/api/operation-tasks', requireAuth, require('./routes/operationTasks'))
app.use('/api/operations', requireAuth, require('./routes/operationsComparison'))
app.use('/api/activities', requireAuth, require('./routes/activities'))
app.use('/api/trials', requireAuth, require('./routes/trials'))
app.use('/api/ops',requireAuth,require('./routes/ops'))
app.use('/api/growth-reports',requireAuth,require('./routes/growthReports'))
app.use('/api/crm/kols', requireAuth, require('./routes/crm'))
app.use('/api/x-acquisition', requireAuth, require('./routes/xAcquisition'))
app.use('/api/content-growth', requireAuth, require('./routes/contentGrowth'))

// Optional AI modules initialize only on explicit AI requests. Business pages do not need Redis, AI storage or keys.
function optionalRouter(modulePath) {
  let router;
  return (req,res,next)=>{
    try { router ||= require(modulePath); return router(req,res,next); }
    catch(error) { return res.status(503).json({error:'可选 AI 服务未就绪：'+error.message}); }
  };
}
app.use('/api/growth-agent', requireAuth, require('./routes/growthAgent').defaultRouter())
app.use('/api/growth-workspace', requireAuth, require('./routes/growthWorkspace').createRouter())
app.use('/api/business-analysis', requireAuth, require('./routes/businessAnalysis'))

// AI Configuration and Management
app.use('/api/ai', requireAuth, optionalRouter('./routes/aiConfig'))

// Cache Management
app.use('/api/cache', requireAuth, optionalRouter('./routes/cache'))

// Queue Management
app.use('/api/queue', requireAuth, (req, res) => res.status(410).json({error: '请使用 /api/ai-analysis 主动分析接口'}))

// AI Analysis (用户主动触发的业务分析和复盘)
app.use('/api/ai-analysis', requireAuth, optionalRouter('./routes/aiAnalysis'))

// WebSocket Management
app.use('/api/websocket', requireAuth, optionalRouter('./routes/websocket'))

// RAG Vector Retrieval
app.use('/api/rag', requireAuth, optionalRouter('./routes/rag'))

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

// Create HTTP server to support WebSocket
const http = require('http');
const server = http.createServer(app);

// Initialize WebSocket server
try {
  if (process.env.AI_WEBSOCKET_ENABLED !== 'true') throw new Error('使用任务轮询；WebSocket 默认关闭');
  const { createServer: createWSServer } = require('./websocket');
  createWSServer(server);
  console.log('WebSocket server initialized');
} catch (error) {
  console.warn('WebSocket initialization skipped:', error.message);
}

server.listen(PORT, require('./middleware/localDevLogin').enabled()?'127.0.0.1':undefined, () => {
 console.log(`Backend (HTTP + WebSocket) running on http://localhost:${PORT}`);
 // No extra Worker/PM2 service: one lightweight cron in each HTTP process.
 // PostgreSQL's existing scheduler lease prevents concurrent replicas scanning.
 // Opt-in daily X read-only monitor, max one run per owner/day.
  const runXMonitor=()=>require('./services/xContentMonitor').monitor.syncDue()
    .catch(error=>console.warn('[x-content] scheduler:',error.message));
  setTimeout(runXMonitor,30000).unref();
  setInterval(runXMonitor,60*60*1000).unref();
  try{require('./ai/growth/monitorScheduler').start()}
 catch(error){console.error('[growth-monitor] scheduler startup failed',error.message)}
});
