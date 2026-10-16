import {getToken} from '../auth/authClient.js'
/**
 * cohortClient.js
 * Thin client for the /api/cohorts backend.
 * Falls back to localStorage when the backend is unreachable.
 */

const BASE = (import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001') + '/api/cohorts'
const LS_KEY = 'logearn.custom.cohorts.v1'

// ── localStorage fallback ─────────────────────────────────────────────────────

function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? [] } catch { return [] }
}
function lsSave(cohorts) {
  localStorage.setItem(LS_KEY, JSON.stringify(cohorts))
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json',...(getToken()?{Authorization:'Bearer '+getToken()}:{}),...(options.headers||{}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status, errors: body.errors })
  }
  return res.json()
}

// ── public API ────────────────────────────────────────────────────────────────

export async function listCohorts() {
  try {
    const data = await apiFetch('/')
    return { cohorts: data.cohorts, source: 'api' }
  } catch (e) {
    if(e.status && e.status<500)throw e
    return { cohorts: lsLoad(), source: 'local' }
  }
}

export async function getCohort(id) {
  try {
    return await apiFetch(`/${id}`)
  } catch (e) {
    if(!id.startsWith('cohort_local_'))throw e
    const cohort = lsLoad().find(c => c.id === id)
    if (!cohort) throw new Error('群组不存在')
    return cohort
  }
}

export async function createCohort({ name, description = '', color = '#6366f1', user_ids = [],kind='static',rule }) {
  try {
    const data = await apiFetch('/', {
      method: 'POST',
      body: JSON.stringify({ name, description, color, user_ids,kind,rule }),
    })
    return { cohort: data.cohort, source: 'api' }
  } catch (e) {
    if(kind==='dynamic')throw e
    // Rethrow validation errors from the backend
    if (e.errors || e.status && e.status < 500) throw e
    // Backend unreachable — save locally
    const id = `cohort_local_${Date.now().toString(36)}`
    const now = Date.now()
    const cohort = {
      id, name, description, color,
      user_ids: [...new Set(user_ids.map(s => String(s).trim()).filter(Boolean))].slice(0, 50000),
      member_count: 0,
      created_at: now,
      updated_at: now,
      source: 'local',
    }
    cohort.member_count = cohort.user_ids.length
    const all = lsLoad()
    all.unshift(cohort)
    lsSave(all)
    return { cohort, source: 'local' }
  }
}

export async function deleteCohort(id) {
  if (id.startsWith('cohort_local_')) { lsSave(lsLoad().filter(c=>c.id!==id));return {deleted:true,source:'local'} }
  return apiFetch(`/${id}`, { method: 'DELETE' })
}

export async function updateCohort(id, { name, description, color }) {
  try {
    const data = await apiFetch(`/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, color }),
    })
    return { cohort: data.cohort, source: 'api' }
  } catch (e) {
    if (e.errors || e.status && e.status < 500) throw e
    const all = lsLoad()
    const idx = all.findIndex(c => c.id === id)
    if (idx === -1) throw new Error('群组不存在')
    all[idx] = { ...all[idx], name: name ?? all[idx].name, description: description ?? all[idx].description, color: color ?? all[idx].color, updated_at: Date.now() }
    lsSave(all)
    return { cohort: all[idx], source: 'local' }
  }
}

export const saveCohortVersion=(id,cache_id)=>apiFetch('/'+encodeURIComponent(id)+'/versions',{method:'POST',body:JSON.stringify({cache_id})})
export const listCohortVersions=(id,offset=0)=>apiFetch('/'+encodeURIComponent(id)+'/versions?offset='+offset)
export const getCohortVersion=(id,version)=>apiFetch('/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(version))
