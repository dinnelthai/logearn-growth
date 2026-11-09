'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUptimeKumaStatusClient } = require('../src/monitoring/uptimeKumaStatus');

const page = {
  config: { title: 'LogEarn Production', description: 'Production service health' },
  incident: null,
  publicGroupList: [{
    id: 1,
    name: 'Core APIs',
    monitorList: [
      { id: 7, name: 'LogEarn API', type: 'http', url: 'https://api.logearn.com/private?token=never-return-this', interval: 60 },
      { id: 8, name: 'Website', type: 'http', url: 'https://logearn.com', interval: 60 },
    ],
  }],
};
const heartbeats = {
  heartbeatList: {
    7: [
      { status: 1, time: '2026-11-09T10:00:00.000Z', msg: '200 OK', ping: 120 },
      { status: 0, time: '2026-11-09T10:01:00.000Z', msg: 'HTTP 504', ping: null },
    ],
    8: [
      { status: 1, time: '2026-11-09T10:01:00.000Z', msg: '200 OK', ping: 48 },
    ],
  },
  uptimeList: { '7_24': 0.9998, '8_24': 0.9999 },
};
const env = {
  NODE_ENV: 'test',
  UPTIME_KUMA_BASE_URL: 'https://status.example.test',
  UPTIME_KUMA_STATUS_SLUG: 'logearn-prod',
};

test('normalizes public status page groups, heartbeat state, uptime and latency without leaking target URLs', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('/heartbeat/') ? heartbeats : page };
  };
  const client = createUptimeKumaStatusClient({ env, fetchImpl, now: () => Date.parse('2026-11-09T10:02:00Z') });
  const result = await client.getOverview();

  assert.equal(calls.length, 2);
  assert.ok(calls.some(call => call.url.endsWith('/api/status-page/logearn-prod')));
  assert.ok(calls.some(call => call.url.endsWith('/api/status-page/heartbeat/logearn-prod')));
  assert.equal(result.configured, true);
  assert.equal(result.state, 'degraded');
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.down, 1);
  assert.equal(result.summary.up, 1);
  assert.equal(result.summary.avgLatencyMs, 48);
  assert.equal(result.groups[0].monitors[0].state, 'down');
  assert.equal(result.groups[0].monitors[0].uptime24h, 99.98);
  assert.equal(result.groups[0].monitors[0].lastMessage, 'HTTP 504');
  assert.equal(result.groups[0].monitors[0].history.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /never-return-this|api\.logearn\.com/);
});

test('returns a clear unconfigured state without attempting outbound requests', async () => {
  let called = false;
  const client = createUptimeKumaStatusClient({
    env: { NODE_ENV: 'development' },
    fetchImpl: async () => { called = true; throw new Error('should not call'); },
  });
  const result = await client.getOverview();
  assert.equal(result.configured, false);
  assert.equal(result.state, 'not_configured');
  assert.equal(result.summary.total, 0);
  assert.equal(called, false);
});

test('supports a reverse-proxy Basic Auth boundary without returning credentials', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(options.headers);
    return { ok: true, json: async () => url.includes('/heartbeat/') ? { heartbeatList: {}, uptimeList: {} } : { config: {}, publicGroupList: [] } };
  };
  const client = createUptimeKumaStatusClient({
    env: { ...env, UPTIME_KUMA_BASIC_AUTH_USER: 'dashboard', UPTIME_KUMA_BASIC_AUTH_PASSWORD: 'secret-password' },
    fetchImpl,
  });
  const result = await client.getOverview();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].Authorization, 'Basic ' + Buffer.from('dashboard:secret-password').toString('base64'));
  assert.doesNotMatch(JSON.stringify(result), /secret-password|dashboard/);
});

test('fails closed for plain HTTP in production unless explicitly allowed', async () => {
  let called = false;
  const client = createUptimeKumaStatusClient({
    env: { ...env, NODE_ENV: 'production', UPTIME_KUMA_BASE_URL: 'http://status.example.test' },
    fetchImpl: async () => { called = true; throw new Error('should not call'); },
  });
  const result = await client.getOverview();
  assert.equal(result.configured, true);
  assert.equal(result.state, 'collector_unavailable');
  assert.equal(called, false);
});

test('does not expose upstream response errors or request credentials', async () => {
  const client = createUptimeKumaStatusClient({
    env: { ...env, UPTIME_KUMA_BASIC_AUTH_USER: 'dashboard', UPTIME_KUMA_BASIC_AUTH_PASSWORD: 'secret-password' },
    fetchImpl: async () => { throw new Error('https://status.example.test secret-password'); },
  });
  const result = await client.getOverview();
  assert.equal(result.state, 'collector_unavailable');
  assert.doesNotMatch(JSON.stringify(result), /status\.example\.test|secret-password/);
});
