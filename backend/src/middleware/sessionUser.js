const db = require('../db/connection');
const localDevLogin = require('./localDevLogin');
function sessionUser(token, req) {
  if (!token || (token.startsWith(localDevLogin.DEV_TOKEN_PREFIX) && !localDevLogin.allowed(req))) return null;
  return db.prepare(`SELECT s.user_id, u.email, u.name FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>?`).get(token, Date.now()) || null;
}
module.exports = sessionUser;
