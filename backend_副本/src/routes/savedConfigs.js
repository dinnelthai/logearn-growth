const express = require('express')
const { randomUUID } = require('node:crypto')
const db = require('../db/connection')
const requireAuth = require('../middleware/requireAuth')

const router = express.Router()

// All routes require auth
router.use(requireAuth)

// ── GET /api/saved-configs ────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT id, name, config, created_at, updated_at FROM saved_configs WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(req.user.user_id)
  // Parse config JSON
  const configs = rows.map(r => ({ ...r, config: JSON.parse(r.config) }))
  res.json({ configs })
})

// ── POST /api/saved-configs ───────────────────────────────────────────────────
router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const config = req.body?.config
  if (!name) return res.status(400).json({ error: '请填写配置名称' })
  if (name.length > 80) return res.status(400).json({ error: '名称不能超过80字' })
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'config 无效' })

  // Max 20 saved configs per user
  const count = db.prepare(`SELECT COUNT(*) AS n FROM saved_configs WHERE user_id = ?`).get(req.user.user_id).n
  if (count >= 20) return res.status(400).json({ error: '最多保存20条配置，请先删除旧的' })

  const id = `sc_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const now = Date.now()
  db.prepare(`INSERT INTO saved_configs (id, user_id, name, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.user_id, name, JSON.stringify(config), now, now)

  res.status(201).json({ config: { id, name, config, created_at: now, updated_at: now } })
})

// ── DELETE /api/saved-configs/:id ────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare(`SELECT id FROM saved_configs WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.user_id)
  if (!row) return res.status(404).json({ error: '配置不存在' })
  db.prepare(`DELETE FROM saved_configs WHERE id = ?`).run(req.params.id)
  res.json({ deleted: true })
})

module.exports = router
