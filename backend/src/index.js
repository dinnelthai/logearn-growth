require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true })
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const db = require('./db/connection')
const seedAdmin = require('./db/seed')
const seedMock = require('./db/seedMock')
const authRouter = require('./routes/auth')
const cohortsRouter = require('./routes/cohorts')
const savedConfigsRouter = require('./routes/savedConfigs')
const analyticsRouter = require('./routes/analytics')
const metricsRouter = require('./routes/metrics')
const drillRouter = require('./routes/drill')
const requireAuth = require('./middleware/requireAuth')

// Run migrations on startup
const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8')
schema.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => db.exec(stmt))

// Seed default admin if no users exist
seedAdmin().catch(console.error)
// Seed analytics mock facts (events / users / referrals / trades)
try { if (process.env.ANALYTICS_STORAGE !== 'hologres') seedMock() } catch (err) { console.error('seedMock failed:', err) }

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',').map(s => s.trim())
    if (!origin || allowed.includes(origin)) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '2mb' }))

// Health check (public)
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// Auth routes (login is public, rest require auth internally)
app.use('/api/auth', authRouter)

// Remote priority analytics routes precede SQLite routes; no silent local fallback.
if (process.env.ANALYTICS_STORAGE === 'hologres') {
  app.use(['/api/analytics', '/api/metrics', '/api/drill', '/api/events'], requireAuth)
  app.use(require('./routes/remoteAnalytics'))
}

// Protected routes
app.use('/api/activities', requireAuth, require('./routes/activities'))
app.use('/api/cohorts', requireAuth, cohortsRouter)
app.use('/api/saved-configs', savedConfigsRouter)
app.use('/api/events', requireAuth, analyticsRouter)
app.use('/api/analytics', requireAuth, analyticsRouter)
app.use('/api/metrics', requireAuth, metricsRouter)
app.use('/api/drill', requireAuth, drillRouter)

// 404
app.use((req, res) => res.status(404).json({ error: '接口不存在' }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(err.status || 503).json({ error: err.status ? err.message : '数据查询失败，请稍后重试' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
