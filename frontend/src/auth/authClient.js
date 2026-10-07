/**
 * authClient.js — thin wrapper around the /api/auth/* endpoints.
 * Token is persisted in localStorage under 'logearn.auth.token'.
 */

const BASE = (import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001') + '/api'
const TOKEN_KEY = 'logearn.auth.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function apiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status, errors: body.errors })
  return body
}

/** Returns { user } if the stored token is valid, throws otherwise. */
export async function getMe() {
  return apiFetch('/auth/me')
}

/** Returns { token, user } and stores the token. */
export async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  return data
}

/** Clears the stored token. */
export async function logout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
  setToken(null)
}

/** Change password. */
export async function changePassword(current_password, new_password) {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
  })
}

/** Update display name. */
export async function updateProfile(name) {
  return apiFetch('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

// ── Saved configs ─────────────────────────────────────────────────────────────

export async function listSavedConfigs() {
  return apiFetch('/saved-configs')
}

export async function saveConfig(name, config) {
  return apiFetch('/saved-configs', {
    method: 'POST',
    body: JSON.stringify({ name, config }),
  })
}

export async function deleteSavedConfig(id) {
  return apiFetch(`/saved-configs/${id}`, { method: 'DELETE' })
}
