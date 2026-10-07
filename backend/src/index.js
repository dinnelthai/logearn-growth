const express = require('express')
const cors = require('cors')
const db = require('./db/connection')
const cohortsRouter = require('./routes/cohorts')

// Run migrations on startup
const fs = require('fs')
const path = require('path')
const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8')
schema.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => db.exec(stmt))

const app = express()

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))
app.use(express.json({ limit: '2mb' }))

// Health check
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// Routes
app.use('/api/cohorts', cohortsRouter)

// 404
app.use((req, res) => res.status(404).json({ error: '接口不存在' }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: '服务器内部错误', detail: err.message })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
