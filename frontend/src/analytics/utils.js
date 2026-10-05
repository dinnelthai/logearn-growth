// UTC+7 fixed offset for Asia/Bangkok (no DST)
const TZ_OFFSET_MS = { 'Asia/Bangkok': 7 * 3600000, UTC: 0 }

// Returns 'YYYY-MM-DD' in the given timezone
export function toDateStr(ts, timezone = 'Asia/Bangkok') {
  const offset = TZ_OFFSET_MS[timezone] ?? 7 * 3600000
  return new Date(ts + offset).toISOString().slice(0, 10)
}

// Day index relative to a base timestamp (both should be local-midnight-aligned)
export function dayNum(ts, baseTs) {
  return Math.floor((ts - baseTs) / 86400000)
}

// Week index (0-based)
export function weekNum(ts, baseTs) {
  return Math.floor((ts - baseTs) / (7 * 86400000))
}

// Human-readable date for display ('MM/DD')
export function fmtDate(ts, timezone = 'Asia/Bangkok') {
  return toDateStr(ts, timezone).slice(5).replace('-', '/')
}
