const express = require('express')
const { randomUUID } = require('node:crypto')
const db = require('../db/connection')
const { hashPassword, verifyPassword, generateToken, tokenExpiry } = require('../middleware/crypto')
const requireAuth = require('../middleware/requireAuth')

const router = express.Router()

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码' })

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email).trim().toLowerCase())
  if (!user) return res.status(401).json({ error: '邮箱或密码错误' })

  const ok = await verifyPassword(String(password), user.password_hash)
  if (!ok) return res.status(401).json({ error: '邮箱或密码错误' })

  const token = generateToken()
  const now = Date.now()
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(token, user.id, now, tokenExpiry())
  db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, user.id)

  res.json({ token, user: { id: user.id, email: user.email, name: user.name } })
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT id, email, name, created_at, last_login_at FROM users WHERE id = ?`).get(req.user.user_id)
  if (!user) return res.status(404).json({ error: '用户不存在' })
  res.json({ user })
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(req.token)
  res.json({ ok: true })
})

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body ?? {}
  if (!current_password || !new_password) return res.status(400).json({ error: '请填写当前密码和新密码' })
  if (String(new_password).length < 8) return res.status(400).json({ error: '新密码至少8位' })

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.user_id)
  const ok = await verifyPassword(String(current_password), user.password_hash)
  if (!ok) return res.status(401).json({ error: '当前密码错误' })

  const hash = await hashPassword(String(new_password))
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, user.id)
  // Invalidate all other sessions except the current one
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).run(user.id, req.token)
  res.json({ ok: true })
})

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────
router.put('/profile', requireAuth, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null
  if (!name) return res.status(400).json({ error: '请填写名称' })
  if (name.length > 60) return res.status(400).json({ error: '名称不能超过60字' })
  db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(name, req.user.user_id)
  const user = db.prepare(`SELECT id, email, name FROM users WHERE id = ?`).get(req.user.user_id)
  res.json({ user })
})

module.exports = router
