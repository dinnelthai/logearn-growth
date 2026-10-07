/** No query parameters or fragment are retained, including UTM (V2). */
export function cleanEntryUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.username = ''; url.password = ''; url.search = ''; url.hash = ''
    return url.href
  } catch { return null }
}

/** Exact hosts by default. Subdomains must be explicitly configured. */
export function isInternalReferrer(referrer, landing, ownHosts = [], subdomainRoots = []) {
  const host = value => {
    try { return new URL(value).hostname.toLowerCase() } catch { return null }
  }
  const normalize = value => String(value).toLowerCase().replace(/\.$/, '')
  const refHost = host(referrer)
  if (!refHost) return false
  const landingHost = host(landing)
  if (refHost === landingHost || ownHosts.some(h => normalize(h) === refHost)) return true
  return subdomainRoots.some(h => { const root = normalize(h); return root && (refHost === root || refHost.endsWith(`.${root}`)) })
}

export function browserStorage(name) {
  try { return globalThis[name] } catch { return undefined }
}

export function readState(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') } catch { return null }
}

export function writeState(storage, key, state) {
  try { storage?.setItem(key, JSON.stringify(state)) } catch { /* Memory-only until the instance is destroyed. */ }
}
