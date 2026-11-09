import { fetchSystemReliabilityOverview } from '../api/systemReliability.js';
import { loadingState } from './loadingState.js';
import { beginPageLoad } from './pageLoading.js';

const STATE = {
  up: ['正常', 'is-up'], down: ['异常', 'is-down'], pending: ['待确认', 'is-warning'],
  maintenance: ['维护中', 'is-neutral'], unknown: ['未知', 'is-unknown'],
};
const OVERALL = {
  up: ['全部正常', 'is-up'], degraded: ['存在异常', 'is-down'], warning: ['状态待确认', 'is-warning'],
  maintenance: ['维护中', 'is-neutral'], empty: ['暂无监控', 'is-unknown'],
  unknown: ['状态未知', 'is-unknown'], collector_unavailable: ['采集器不可用', 'is-down'],
  not_configured: ['未接入', 'is-unknown'],
};

export function createSystemReliabilityPage(ctx) {
  const { $, esc, fmt } = ctx;
  let generation = 0;
  const time = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Bangkok', hour12: false }) : '—';
  };
  const duration = value => {
    const seconds = Math.max(0, Number(value) || 0);
    if (seconds >= 86400) return Math.floor(seconds / 86400) + ' 天 ' + Math.floor(seconds % 86400 / 3600) + ' 小时';
    if (seconds >= 3600) return Math.floor(seconds / 3600) + ' 小时 ' + Math.floor(seconds % 3600 / 60) + ' 分钟';
    if (seconds >= 60) return Math.floor(seconds / 60) + ' 分钟';
    return Math.floor(seconds) + ' 秒';
  };
  const badge = state => {
    const item = STATE[state] || STATE.unknown;
    return '<span class="sr-status-badge ' + item[1] + '">' + item[0] + '</span>';
  };
  function monitorCard(monitor) {
    const history = (monitor.history || []).map(beat => {
      const state = STATE[beat.state] || STATE.unknown;
      const title = time(beat.time) + ' · ' + state[0] + (beat.message ? ' · ' + beat.message : '');
      return '<li class="sr-beat ' + state[1] + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"></li>';
    }).join('');
    const uptime = monitor.uptime24h == null ? '—' : Number(monitor.uptime24h).toFixed(2) + '%';
    const ping = monitor.pingMs == null ? '—' : fmt(monitor.pingMs) + ' ms';
    const interval = monitor.intervalSeconds == null ? '—' : fmt(monitor.intervalSeconds) + ' 秒';
    return '<article class="sr-monitor-card">' +
      '<header class="sr-monitor-head"><div><h3>' + esc(monitor.name) + '</h3><span>' + esc(monitor.type) + '</span></div>' + badge(monitor.state) + '</header>' +
      '<div class="sr-monitor-metrics"><div><small>24 小时可用率</small><strong>' + uptime + '</strong></div><div><small>最近响应</small><strong>' + ping + '</strong></div><div><small>检查间隔</small><strong>' + interval + '</strong></div></div>' +
      '<div class="sr-monitor-last"><span>最近检查 ' + time(monitor.lastCheckedAt) + '</span><span>' + esc(monitor.lastMessage || '暂无响应说明') + '</span></div>' +
      '<ol class="sr-history" aria-label="最近检查记录">' + history + '</ol></article>';
  }
  function setupGuide() {
    return '<details class="a-card sr-setup-guide" open><summary>如何接入 Uptime Kuma</summary>' +
      '<ol><li>在 Uptime Kuma 中添加 HTTP(s) 监控，分别检查官网、登录接口、交易 API、数据 API 和关键 RPC。</li>' +
      '<li>把监控项加入一个已发布的 Status Page 分组；LogEarn 只读取状态页数据，不使用不稳定的内部 Socket.IO 管理接口。</li>' +
      '<li>在后端环境变量配置 <code>UPTIME_KUMA_BASE_URL</code> 与 <code>UPTIME_KUMA_STATUS_SLUG</code>，重启后端即可读取。</li></ol>' +
      '<div class="sr-auth-guide"><strong>需要登录的接口也可以监控</strong><p>在 Uptime Kuma 的 HTTP(s) 监控中配置 Bearer Token 或自定义 Authorization 请求头。建议使用只读服务账号；Token 保存在 Uptime Kuma，不会发送到浏览器，也不会写入 LogEarn 数据库。</p></div>' +
      '<div class="sr-auth-guide"><strong>内部状态页的保护</strong><p>Uptime Kuma 发布的 Status Page 数据接口默认可公开访问。如不希望状态页公开，请在反向代理层加 Basic Auth，并在 LogEarn 后端配置 UPTIME_KUMA_BASIC_AUTH_USER / UPTIME_KUMA_BASIC_AUTH_PASSWORD。</p></div>' +
      '<p class="a-muted">实际更新受 Uptime Kuma 检查间隔与状态页缓存影响，请以最近心跳时间为准。此页面用于服务可靠性观察，不应作为实时交易执行信号。</p></details>';
  }
  function render(data) {
    const summary = data.summary || {};
    const overall = OVERALL[data.state] || OVERALL.unknown;
    const runtime = data.runtime || {};
    const groups = (data.groups || []).map(group =>
      '<section class="sr-group"><header><h2>' + esc(group.name) + '</h2><span>' + fmt((group.monitors || []).length) + ' 个监控项</span></header>' +
      ((group.monitors || []).length ? '<div class="sr-monitor-grid">' + group.monitors.map(monitorCard).join('') + '</div>' : '<p class="sr-empty">这个分组还没有公开监控项。</p>') +
      '</section>'
    ).join('');
    const incident = data.incident
      ? '<section class="a-card sr-incident"><div><span class="activity-eyebrow">ACTIVE INCIDENT</span><h2>' + esc(data.incident.title || '当前事件') + '</h2><p>' + esc(data.incident.content || '') + '</p></div><span class="sr-status-badge is-warning">状态公告</span></section>'
      : '';
    const empty = data.configured && !summary.total && data.state !== 'collector_unavailable'
      ? '<section class="a-card sr-empty-state"><h2>状态页尚未添加监控项</h2><p>请在 Uptime Kuma 的 Status Page 中添加需要展示的监控分组与监控项。</p></section>' : '';
    const collector = data.state === 'collector_unavailable'
      ? '<section class="a-card sr-collector-error" role="alert"><strong>无法读取 Uptime Kuma</strong><p>' + esc(data.error || '请检查服务地址、状态页发布状态和网络连接。') + '</p></section>' : '';
    const notConfigured = !data.configured
      ? '<section class="a-card sr-empty-state"><h2>还没有接入 Uptime Kuma</h2><p>接入后可以统一观察网站、登录 API、交易 API、关键数据接口和链上 RPC 的可用性与响应时间。</p></section>' : '';
    return '<div class="si-page system-reliability">' +
      '<header class="sr-page-header"><div><span class="activity-eyebrow">SYSTEM RELIABILITY</span><h1>系统可靠性</h1><p>服务可用性 · 接口响应 · 最近心跳 · 运行环境</p></div><button class="a-button" type="button" data-reliability-refresh>刷新状态</button></header>' +
      '<section class="a-card sr-overview"><div class="sr-overview-head"><div><span class="a-muted">总体状态</span><h2>' + overall[0] + '</h2></div><span class="sr-status-badge ' + overall[1] + '">' + overall[0] + '</span></div>' +
      '<div class="sr-summary-grid"><div><small>监控项</small><strong>' + fmt(summary.total || 0) + '</strong></div><div><small>正常</small><strong>' + fmt(summary.up || 0) + '</strong></div><div><small>异常</small><strong>' + fmt(summary.down || 0) + '</strong></div><div><small>平均响应</small><strong>' + (summary.avgLatencyMs == null ? '—' : fmt(summary.avgLatencyMs) + ' ms') + '</strong></div></div>' +
      '<p class="sr-checked-at">LogEarn 读取时间 ' + time(data.checkedAt) + ' · ' + esc(data.cacheNote || '状态页数据可能缓存约 5 分钟。') + '</p></section>' +
      collector + notConfigured + incident + empty + groups +
      '<section class="a-card sr-runtime"><header><h2>LogEarn 后端运行环境</h2><span class="sr-status-badge is-up">当前请求已成功返回</span></header>' +
      '<div class="sr-runtime-grid"><div><small>进程运行时间</small><strong>' + duration(runtime.uptimeSeconds) + '</strong></div><div><small>内存 RSS</small><strong>' + (runtime.memoryRssMb == null ? '—' : fmt(runtime.memoryRssMb) + ' MB') + '</strong></div><div><small>Heap 使用</small><strong>' + (runtime.heapUsedMb == null ? '—' : fmt(runtime.heapUsedMb) + ' / ' + fmt(runtime.heapTotalMb) + ' MB') + '</strong></div><div><small>Node.js</small><strong>' + esc(runtime.nodeVersion || '—') + '</strong></div></div></section>' +
      setupGuide() + '</div>';
  }
  async function draw() {
    ctx.clear?.();
    const token = ++generation;
    const host = $('#as-output');
    const finishLoading = beginPageLoad(host, { placeholder: loadingState('正在读取 Uptime Kuma 服务状态…'), selector: '.system-reliability', message: '正在刷新系统可靠性状态，保留当前结果…' });
    try {
      const data = await fetchSystemReliabilityOverview();
      if (token !== generation) return;
      host.innerHTML = render(data);
      host.querySelector('[data-reliability-refresh]')?.addEventListener('click', draw);
    } catch (error) {
      if (token !== generation) return;
      host.innerHTML = '<section class="a-card sr-collector-error" role="alert"><h2>系统可靠性加载失败</h2><p>' + esc(error.message) + '</p><button class="a-button" type="button" data-reliability-refresh>重新读取</button></section>';
      host.querySelector('[data-reliability-refresh]')?.addEventListener('click', draw);
    } finally {
      finishLoading();
    }
  }
  return { draw, dispose() { generation++; } };
}
