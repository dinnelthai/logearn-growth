/**
 * seed.js — creates the default admin account on first run.
 * Called from index.js at startup if no users exist.
 */
const { randomBytes } = require('node:crypto')
const db = require('./connection')
const { hashPassword } = require('../middleware/crypto')

async function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (count > 0) return

  const email = process.env.ADMIN_EMAIL || 'admin@logearn.com'
  const password = process.env.ADMIN_PASSWORD || randomBytes(8).toString('hex')
  const name = process.env.ADMIN_NAME || 'Admin'
  const id = `user_${randomBytes(8).toString('hex')}`
  const hash = await hashPassword(password)

  db.prepare(`INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, email, name, hash, Date.now())

  console.log('─────────────────────────────────────────')
  console.log('初始管理员账号已创建：')
  console.log(`  邮箱：${email}`)
  console.log(`  密码：${password}`)
  console.log('请登录后立即修改密码。')
  console.log('─────────────────────────────────────────')
}

module.exports = seedAdmin
