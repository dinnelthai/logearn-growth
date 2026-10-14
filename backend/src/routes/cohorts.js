const express = require('express')
const { randomUUID } = require('node:crypto')
const db = require('../db/connection')
const { validateCohortBody, cleanUserIds } = require('../middleware/validate')

const router = express.Router()

// ── helpers ───────────────────────────────────────────────────────────────────

function getCohort(id, owner) {
  return db.prepare(`SELECT * FROM cohorts WHERE id = ? AND created_by = ? AND is_deleted = 0`).get(id, String(owner))
}

function memberCount(id) {
  return db.prepare(`SELECT COUNT(*) AS n FROM cohort_members WHERE cohort_id = ?`).get(id).n
}

function withTx(fn) {
  db.exec('BEGIN')
  try { fn(); db.exec('COMMIT') }
  catch (e) { db.exec('ROLLBACK'); throw e }
}

function insertMembers(cohortId, userIds, now) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, ?)`)
  withTx(() => { for (const uid of userIds) stmt.run(cohortId, uid, now) })
}

// ── GET /api/cohorts ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.description, c.color, c.created_at, c.updated_at, c.created_by,
           COUNT(m.user_id) AS member_count
    FROM cohorts c
    LEFT JOIN cohort_members m ON m.cohort_id = c.id
    WHERE c.is_deleted = 0 AND c.created_by = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all(String(req.user.user_id))
  res.json({ cohorts: rows })
})

// ── POST /api/cohorts ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { errors, value } = validateCohortBody(req.body, { requireUsers: false })
  if (errors.length) return res.status(400).json({ errors })

  const id = `cohort_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const now = Date.now()

  db.prepare(`
    INSERT INTO cohorts (id, name, description, color, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, value.name, value.description, value.color, now, now, String(req.user.user_id))

  if (value.userIds?.length) insertMembers(id, value.userIds, now)

  res.status(201).json({ cohort: { ...getCohort(id, req.user.user_id), member_count: memberCount(id), truncated: value.truncated } })
})

// ── GET /api/cohorts/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const cohort = getCohort(req.params.id, req.user.user_id)
  if (!cohort) return res.status(404).json({ error: '群组不存在' })
  const members = db.prepare(`SELECT user_id FROM cohort_members WHERE cohort_id = ? ORDER BY added_at`).all(cohort.id)
  res.json({ ...cohort, user_ids: members.map(m => m.user_id) })
})

// ── PUT /api/cohorts/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const cohort = getCohort(req.params.id, req.user.user_id)
  if (!cohort) return res.status(404).json({ error: '群组不存在' })

  const { errors, value } = validateCohortBody({ ...cohort, ...req.body })
  if (errors.length) return res.status(400).json({ errors })

  db.prepare(`UPDATE cohorts SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ?`)
    .run(value.name, value.description, value.color, Date.now(), cohort.id)

  res.json({ cohort: { ...getCohort(cohort.id, req.user.user_id), member_count: memberCount(cohort.id) } })
})

// ── POST /api/cohorts/:id/members ─────────────────────────────────────────────
router.post('/:id/members', (req, res) => {
  const cohort = getCohort(req.params.id, req.user.user_id)
  if (!cohort) return res.status(404).json({ error: '群组不存在' })

  const { ids, truncated, invalid } = cleanUserIds(req.body?.user_ids)
  if (invalid) return res.status(400).json({ errors: ['user_ids 必须是字符串数组'] })
  if (!ids.length) return res.status(400).json({ errors: ['user_ids 不能为空'] })

  const now = Date.now()
  insertMembers(cohort.id, ids, now)
  db.prepare(`UPDATE cohorts SET updated_at = ? WHERE id = ?`).run(now, cohort.id)
  res.json({ added: ids.length, truncated, member_count: memberCount(cohort.id) })
})

// ── DELETE /api/cohorts/:id/members ──────────────────────────────────────────
router.delete('/:id/members', (req, res) => {
  const cohort = getCohort(req.params.id, req.user.user_id)
  if (!cohort) return res.status(404).json({ error: '群组不存在' })

  const { ids, invalid } = cleanUserIds(req.body?.user_ids)
  if (invalid) return res.status(400).json({ errors: ['user_ids 必须是字符串数组'] })

  if (ids.length) {
    const stmt = db.prepare(`DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?`)
    withTx(() => { for (const uid of ids) stmt.run(cohort.id, uid) })
    db.prepare(`UPDATE cohorts SET updated_at = ? WHERE id = ?`).run(Date.now(), cohort.id)
  }

  res.json({ removed: ids.length, member_count: memberCount(cohort.id) })
})

// ── DELETE /api/cohorts/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const cohort = getCohort(req.params.id, req.user.user_id)
  if (!cohort) return res.status(404).json({ error: '群组不存在' })
  db.prepare(`UPDATE cohorts SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(Date.now(), cohort.id)
  res.json({ deleted: true })
})

module.exports = router
