/** requireAuth middleware — reads Bearer token, injects req.user or returns 401. */
const db = require('../db/connection')
const localDevLogin = require('./localDevLogin')

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })
  if(token.startsWith(localDevLogin.DEV_TOKEN_PREFIX)&&!localDevLogin.allowed(req))return res.status(401).json({error:'本地开发登录已关闭，请重新登录'})

  const now = Date.now()
  const session = db.prepare(
    `SELECT s.user_id, u.email, u.name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, now)

  if (!session) return res.status(401).json({ error: 'Token 已失效，请重新登录' })
  req.user = session
  req.token = token
  next()
}
