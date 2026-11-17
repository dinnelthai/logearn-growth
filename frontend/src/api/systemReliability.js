import { getToken, notifyExpiredSession } from '../auth/authClient.js';
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001';
export async function fetchSystemReliabilityOverview() {
  const token = getToken();
  const response = await fetch(BACKEND_BASE + '/api/system-reliability/overview', {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    notifyExpiredSession(response);
    throw Object.assign(new Error(body.error || ('HTTP ' + response.status)), { status: response.status });
  }
  return body;
}
