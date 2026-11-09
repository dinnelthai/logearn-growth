import { test, expect, vi, beforeEach } from 'vitest';
vi.mock('../../api/systemReliability.js', () => ({ fetchSystemReliabilityOverview: vi.fn() }));
import { fetchSystemReliabilityOverview } from '../../api/systemReliability.js';
import { createSystemReliabilityPage } from '../systemReliability.js';

function setup() {
  const refresh = { addEventListener: vi.fn() };
  const host = { innerHTML: '', querySelector: selector => selector === '[data-reliability-refresh]' ? refresh : null };
  const ctx = { $: () => host, esc: String, fmt: value => String(value), clear: vi.fn() };
  return { host, refresh, page: createSystemReliabilityPage(ctx) };
}
beforeEach(() => vi.resetAllMocks());

test('shows setup guidance when Uptime Kuma is not configured', async () => {
  fetchSystemReliabilityOverview.mockResolvedValue({
    configured: false, state: 'not_configured',
    summary: { total: 0, up: 0, down: 0, avgLatencyMs: null },
    runtime: { uptimeSeconds: 3600, memoryRssMb: 128, heapUsedMb: 64, heapTotalMb: 96, nodeVersion: 'v22' },
  });
  const t = setup(); await t.page.draw();
  expect(t.host.innerHTML).toContain('还没有接入 Uptime Kuma');
  expect(t.host.innerHTML).toContain('UPTIME_KUMA_BASE_URL');
  expect(t.host.innerHTML).toContain('需要登录的接口也可以监控');
  expect(t.host.innerHTML).toContain('Token 保存在 Uptime Kuma');
  expect(t.host.innerHTML).not.toContain('secret-token');
  expect(t.refresh.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
});

test('renders uptime, latency, heartbeats and incidents without exposing monitor URLs', async () => {
  fetchSystemReliabilityOverview.mockResolvedValue({
    configured: true, state: 'degraded', checkedAt: '2026-11-09T10:00:00Z',
    summary: { total: 1, up: 0, down: 1, avgLatencyMs: null },
    groups: [{ name: 'Core API', monitors: [{
      name: 'LogEarn API', type: 'http', state: 'down', pingMs: 42,
      uptime24h: 99.98, intervalSeconds: 60, lastCheckedAt: '2026-11-09T09:59:00Z',
      lastMessage: 'HTTP 504', history: [{ state: 'up', time: '2026-11-09T09:58:00Z', message: '200 OK', pingMs: 42 }],
    }] }],
    incident: { title: 'API latency', content: 'Investigating', style: 'warning' },
    runtime: { uptimeSeconds: 7200, memoryRssMb: 256, heapUsedMb: 128, heapTotalMb: 192, nodeVersion: 'v22.14.0' },
  });
  const t = setup(); await t.page.draw();
  expect(t.host.innerHTML).toContain('LogEarn API');
  expect(t.host.innerHTML).toContain('HTTP 504');
  expect(t.host.innerHTML).toContain('99.98%');
  expect(t.host.innerHTML).toContain('42 ms');
  expect(t.host.innerHTML).toContain('API latency');
  expect(t.host.innerHTML).toContain('256 MB');
  expect(t.host.innerHTML).not.toContain('https://api.logearn.com');
});

test('collector failure is distinct from a monitor outage', async () => {
  fetchSystemReliabilityOverview.mockResolvedValue({
    configured: true, state: 'collector_unavailable',
    error: '无法读取 Uptime Kuma 状态页，请检查网络连通性与状态页发布状态。',
    summary: { total: 0, up: 0, down: 0, avgLatencyMs: null },
    groups: [], runtime: { uptimeSeconds: 60 },
  });
  const t = setup(); await t.page.draw();
  expect(t.host.innerHTML).toContain('采集器不可用');
  expect(t.host.innerHTML).toContain('无法读取 Uptime Kuma');
  expect(t.host.innerHTML).not.toContain('0 个服务监控异常');
});
