const MAX_NAME = 80
const MAX_DESC = 500
const MAX_MEMBERS = 50000
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** Normalise a raw user_id list: trim, drop empties, dedupe, cap length. */
function cleanUserIds(input) {
  if (!Array.isArray(input)) return { ids: [], truncated: false, invalid: true }
  const seen = new Set()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const id = raw.trim()
    if (id) seen.add(id)
  }
  const ids = [...seen]
  const truncated = ids.length > MAX_MEMBERS
  return { ids: truncated ? ids.slice(0, MAX_MEMBERS) : ids, truncated, invalid: false }
}

function validateCohortBody(body, { requireUsers = false } = {}) {
  const errors = []
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) errors.push('name 必填')
  if (name.length > MAX_NAME) errors.push(`name 不能超过 ${MAX_NAME} 字`)

  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  if (description.length > MAX_DESC) errors.push(`description 不能超过 ${MAX_DESC} 字`)

  const color = body?.color ?? '#6366f1'
  if (!COLOR_RE.test(color)) errors.push('color 必须是 #RRGGBB 格式')

  let userIds = null, truncated = false
  if (requireUsers || body?.user_ids !== undefined) {
    const cleaned = cleanUserIds(body?.user_ids)
    if (cleaned.invalid) errors.push('user_ids 必须是字符串数组')
    userIds = cleaned.ids
    truncated = cleaned.truncated
    if (requireUsers && userIds.length === 0) errors.push('user_ids 至少包含一个有效 ID')
  }

  return { errors, value: { name, description, color, userIds, truncated } }
}

module.exports = { validateCohortBody, cleanUserIds, MAX_MEMBERS }
