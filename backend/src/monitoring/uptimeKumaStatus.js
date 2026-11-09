'use strict';

const STATUS_BY_CODE = Object.freeze({
  0: 'down',
  1: 'up',
  2: 'pending',
  3: 'maintenance',
});

function runtimeSnapshot(now = Date.now) {
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    memoryRssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
    nodeVersion: process.version,
    checkedAt: new Date(now()).toISOString(),
  };
}

function readConfig(env) {
  const baseValue = String(env.UPTIME_KUMA_BASE_URL || '').trim();
  const slug = String(env.UPTIME_KUMA_STATUS_SLUG || '').trim();
  if (!baseValue && !slug) return null;
  if (!baseValue || !slug) throw new Error('incomplete_config');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(slug)) throw new Error('invalid_slug');

  const base = new URL(baseValue);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('invalid_base_url');
  }
  if (env.NODE_ENV === 'production' && base.protocol !== 'https:' && env.UPTIME_KUMA_ALLOW_HTTP !== 'true') {
    throw new Error('https_required');
  }

  const user = String(env.UPTIME_KUMA_BASIC_AUTH_USER || '');
  const password = String(env.UPTIME_KUMA_BASIC_AUTH_PASSWORD || '');
  if (!!user !== !!password) throw new Error('incomplete_basic_auth');

  const timeoutValue = Number(env.UPTIME_KUMA_STATUS_PAGE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue >= 1000 && timeoutValue <= 15000
    ? Math.round(timeoutValue)
    : 8000;
  const prefix = base.pathname.replace(/\/+$/, '');
  const makeUrl = suffix => base.origin + prefix + suffix;
  const headers = { Accept: 'application/json' };
  if (user && password) {
    headers.Authorization = 'Basic ' + Buffer.from(user + ':' + password).toString('base64');
  }
  return {
    slug,
    timeoutMs,
    headers,
    statusUrl: makeUrl('/api/status-page/' + encodeURIComponent(slug)),
    heartbeatUrl: makeUrl('/api/status-page/heartbeat/' + encodeURIComponent(slug)),
  };
}

function safeText(value, max = 180) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function parseTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function normalizeBeat(beat) {
  const code = Number(beat?.status);
  const ping = beat?.ping == null ? null : Number(beat.ping);
  return {
    state: STATUS_BY_CODE[code] || 'unknown',
    time: typeof beat?.time === 'string' ? beat.time : null,
    message: safeText(beat?.msg),
    pingMs: Number.isFinite(ping) ? ping : null,
  };
}

function summarize(monitors) {
  const counts = { total: monitors.length, up: 0, down: 0, pending: 0, maintenance: 0, unknown: 0 };
  const pings = [];
  const uptimes = [];
  for (const monitor of monitors) {
    counts[monitor.state] = (counts[monitor.state] || 0) + 1;
    if (Number.isFinite(monitor.pingMs)) pings.push(monitor.pingMs);
    if (Number.isFinite(monitor.uptime24h)) uptimes.push(monitor.uptime24h);
  }
  let state = 'unknown';
  if (counts.down > 0) state = 'degraded';
  else if (counts.pending > 0 || counts.unknown > 0) state = 'warning';
  else if (counts.total === 0) state = 'empty';
  else if (counts.up === 0 && counts.maintenance > 0) state = 'maintenance';
  else state = 'up';
  return {
    ...counts,
    state,
    avgLatencyMs: pings.length ? Math.round(pings.reduce((sum, n) => sum + n, 0) / pings.length) : null,
    avgUptime24h: uptimes.length ? Math.round(uptimes.reduce((sum, n) => sum + n, 0) / uptimes.length * 100) / 100 : null,
  };
}

function createUptimeKumaStatusClient({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  async function requestJson(url, config) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: config.headers,
      redirect: 'error',
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response?.ok) throw new Error('upstream_unavailable');
    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_payload');
    return body;
  }

  async function getOverview() {
    const checkedAt = new Date(now()).toISOString();
    const runtime = runtimeSnapshot(now);
    let config;
    try {
      config = readConfig(env);
    } catch {
      return {
        configured: true,
        state: 'collector_unavailable',
        error: 'Uptime Kuma 配置无效，请检查地址、Slug、HTTPS 与 Basic Auth 设置。',
        summary: summarize([]),
        groups: [],
        incident: null,
        runtime,
        checkedAt,
        cacheNote: 'Uptime Kuma 状态页数据可能缓存约 5 分钟。',
      };
    }

    if (!config) {
      return {
        configured: false,
        state: 'not_configured',
        error: null,
        summary: summarize([]),
        groups: [],
        incident: null,
        runtime,
        checkedAt,
        cacheNote: 'Uptime Kuma 状态页数据可能缓存约 5 分钟。',
      };
    }

    try {
      const [page, heartbeat] = await Promise.all([
        requestJson(config.statusUrl, config),
        requestJson(config.heartbeatUrl, config),
      ]);
      const heartbeatList = heartbeat.heartbeatList && typeof heartbeat.heartbeatList === 'object'
        ? heartbeat.heartbeatList
        : {};
      const uptimeList = heartbeat.uptimeList && typeof heartbeat.uptimeList === 'object'
        ? heartbeat.uptimeList
        : {};
      const groups = (Array.isArray(page.publicGroupList) ? page.publicGroupList : []).map(group => {
        const monitors = (Array.isArray(group.monitorList) ? group.monitorList : []).map(monitor => {
          const id = String(monitor.id);
          const beats = Array.isArray(heartbeatList[id]) ? heartbeatList[id].slice() : [];
          beats.sort((a, b) => parseTime(a?.time) - parseTime(b?.time));
          const latest = beats.length ? normalizeBeat(beats[beats.length - 1]) : normalizeBeat(null);
          const uptimeValue = uptimeList[id + '_24'];
          const uptime24h = uptimeValue == null || !Number.isFinite(Number(uptimeValue))
            ? null
            : Math.round(Number(uptimeValue) * 10000) / 100;
          return {
            id,
            name: safeText(monitor.name, 120) || '未命名监控',
            type: safeText(monitor.type, 40) || 'http',
            intervalSeconds: Number.isFinite(Number(monitor.interval)) ? Number(monitor.interval) : null,
            state: latest.state,
            pingMs: latest.pingMs,
            uptime24h,
            lastCheckedAt: latest.time,
            lastMessage: latest.message,
            history: beats.slice(-12).map(normalizeBeat),
          };
        });
        return {
          id: String(group.id ?? group.name ?? 'group'),
          name: safeText(group.name, 120) || '未命名分组',
          monitors,
        };
      });
      const monitors = groups.flatMap(group => group.monitors);
      return {
        configured: true,
        state: summarize(monitors).state,
        error: null,
        page: {
          title: safeText(page.config?.title, 120) || 'Uptime Kuma',
          description: safeText(page.config?.description, 240),
        },
        summary: summarize(monitors),
        groups,
        incident: page.incident ? {
          title: safeText(page.incident.title, 180),
          content: safeText(page.incident.content, 600),
          style: safeText(page.incident.style, 32),
          createdAt: page.incident.createdDate || null,
          updatedAt: page.incident.lastUpdatedDate || null,
        } : null,
        runtime,
        checkedAt,
        cacheNote: 'Uptime Kuma 状态页数据可能缓存约 5 分钟。',
      };
    } catch {
      return {
        configured: true,
        state: 'collector_unavailable',
        error: '无法读取 Uptime Kuma 状态页，请检查网络连通性与状态页发布状态。',
        summary: summarize([]),
        groups: [],
        incident: null,
        runtime,
        checkedAt,
        cacheNote: 'Uptime Kuma 状态页数据可能缓存约 5 分钟。',
      };
    }
  }

  return { getOverview };
}

module.exports = { createUptimeKumaStatusClient, summarize, readConfig };
