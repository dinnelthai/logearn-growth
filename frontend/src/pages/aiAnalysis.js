/**
 * AI 分析监控页面
 * 包含异常检测、每日简报、实时进度显示
 */

import './aiAnalysis.css';
import { loadingState } from './loadingState.js';
import {
  createAnomalyDetection,
  createDailyReport,
  getRecentJobs,
  getQueueStats,
  getJobStatus,
  getTodayUsage
} from '../api/aiAnalysis.js';
import { formatDate } from '../analytics/reportPeriod.js';

// WebSocket 连接（如果可用）
let ws = null;
let jobProgressListeners = {};

/**
 * 初始化 WebSocket 连接
 */
function initWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) return;

  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
  ws = new WebSocket(`${wsUrl}/ws`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'job:progress') {
        const { jobId, progress, data } = message;
        const listener = jobProgressListeners[jobId];
        if (listener) {
          listener(progress, data);
        }
      }
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    // 5秒后重连
    setTimeout(initWebSocket, 5000);
  };
}

/**
 * 注册任务进度监听
 */
function onJobProgress(jobId, callback) {
  jobProgressListeners[jobId] = callback;
}

/**
 * 取消任务进度监听
 */
function offJobProgress(jobId) {
  delete jobProgressListeners[jobId];
}

/**
 * 轮询任务状态
 */
async function pollJobStatus(jobId, onProgress) {
  const maxAttempts = 120; // 最多 10 分钟
  let attempts = 0;

  const poll = async () => {
    try {
      const status = await getJobStatus(jobId);

      if (onProgress) {
        onProgress(status.progress || 0, status);
      }

      // 任务完成或失败
      if (status.state === 'completed' || status.state === 'failed') {
        offJobProgress(jobId);
        return status;
      }

      // 继续轮询
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 5000);
      } else {
        offJobProgress(jobId);
        throw new Error('任务执行超时');
      }
    } catch (error) {
      offJobProgress(jobId);
      throw error;
    }
  };

  return poll();
}

/**
 * 格式化时间戳
 */
function formatTimestamp(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 格式化持续时间
 */
function formatDuration(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分${seconds % 60}秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours}小时${minutes % 60}分`;
}

/**
 * 获取任务状态标签
 */
function getStatusBadge(state) {
  const badges = {
    waiting: '<span class="status-badge status-waiting">等待中</span>',
    active: '<span class="status-badge status-active">执行中</span>',
    completed: '<span class="status-badge status-completed">已完成</span>',
    failed: '<span class="status-badge status-failed">失败</span>',
    delayed: '<span class="status-badge status-delayed">延迟</span>',
    paused: '<span class="status-badge status-paused">暂停</span>'
  };
  return badges[state] || state;
}

/**
 * 创建 AI 分析页面
 */
export function createAIAnalysis(ctx) {
  const { $, esc, fmt } = ctx;
  let request = 0;

  async function draw() {
    const id = ++request;
    const host = $('#as-output');
    host.innerHTML = loadingState('正在加载 AI 分析面板…');

    try {
      // 并行获取数据
      const [recentJobs, queueStats, todayUsage] = await Promise.all([
        getRecentJobs('ai-analysis', 'completed', 20).catch(() => ({ jobs: [] })),
        getQueueStats('ai-analysis').catch(() => null),
        getTodayUsage().catch(() => null)
      ]);

      if (id !== request) return;

      host.innerHTML = renderPage(recentJobs, queueStats, todayUsage);
      bindEvents(host);
    } catch (e) {
      if (id === request) {
        host.innerHTML = `<p class="a-empty">加载失败：${esc(e.message)}</p>`;
      }
    }
  }

  /**
   * 渲染页面
   */
  function renderPage(recentJobs, queueStats, todayUsage) {
    return `
      <div class="si-page ai-analysis-page">
        <!-- 页面标题 -->
        <section class="a-card">
          <div class="si-sectionhead">
            <div>
              <h1>AI 增长分析</h1>
              <p>自动异常检测、每日简报与增长洞察</p>
            </div>
          </div>
        </section>

        <!-- 队列统计 -->
        ${queueStats ? renderQueueStats(queueStats) : ''}

        <!-- 今日使用统计 -->
        ${todayUsage ? renderUsageStats(todayUsage) : ''}

        <!-- 快速操作 -->
        <section class="a-card">
          <h2>快速开始</h2>
          <div class="ai-actions">
            <button class="a-button" data-action="anomaly-detection">
              🔍 异常检测
            </button>
            <button class="a-button" data-action="daily-report">
              📊 每日简报
            </button>
          </div>
        </section>

        <!-- 执行中的任务 -->
        <section class="a-card" id="active-jobs">
          <!-- 动态更新 -->
        </section>

        <!-- 最近完成的任务 -->
        <section class="a-card">
          <div class="si-sectionhead">
            <h2>最近完成的分析</h2>
            <span class="a-muted">最近 20 条</span>
          </div>
          ${renderRecentJobs(recentJobs)}
        </section>
      </div>
    `;
  }

  /**
   * 渲染队列统计
   */
  function renderQueueStats(stats) {
    return `
      <section class="a-card">
        <h2>队列状态</h2>
        <div class="ai-stats-grid">
          <div class="ai-stat">
            <span>等待中</span>
            <strong>${fmt(stats.waiting || 0)}</strong>
          </div>
          <div class="ai-stat">
            <span>执行中</span>
            <strong>${fmt(stats.active || 0)}</strong>
          </div>
          <div class="ai-stat">
            <span>已完成</span>
            <strong>${fmt(stats.completed || 0)}</strong>
          </div>
          <div class="ai-stat">
            <span>失败</span>
            <strong class="${stats.failed > 0 ? 'text-error' : ''}">${fmt(stats.failed || 0)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * 渲染使用统计
   */
  function renderUsageStats(usage) {
    return `
      <section class="a-card">
        <h2>今日使用</h2>
        <div class="ai-stats-grid">
          <div class="ai-stat">
            <span>总调用次数</span>
            <strong>${fmt(usage.totalCalls || 0)}</strong>
          </div>
          <div class="ai-stat">
            <span>总 Tokens</span>
            <strong>${fmt(usage.totalTokens || 0)}</strong>
          </div>
          <div class="ai-stat">
            <span>总成本</span>
            <strong>$${(usage.totalCost || 0).toFixed(4)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * 渲染最近任务列表
   */
  function renderRecentJobs(recentJobs) {
    if (!recentJobs.jobs || recentJobs.jobs.length === 0) {
      return '<p class="a-empty">暂无分析记录</p>';
    }

    const rows = recentJobs.jobs.map(job => {
      const duration = job.finishedOn && job.processedOn
        ? formatDuration(job.finishedOn - job.processedOn)
        : '—';

      const resultPreview = renderJobResult(job);

      return `
        <div class="ai-job-card" data-job-id="${esc(job.id)}">
          <div class="ai-job-header">
            <div>
              <strong>${getJobTypeName(job.name)}</strong>
              ${getStatusBadge(job.state || 'completed')}
            </div>
            <span class="a-muted">${formatTimestamp(job.finishedOn || job.timestamp)}</span>
          </div>
          <div class="ai-job-meta">
            <span>耗时: ${duration}</span>
            <span>尝试: ${job.attempts || 1} 次</span>
          </div>
          ${resultPreview}
        </div>
      `;
    }).join('');

    return `<div class="ai-jobs-list">${rows}</div>`;
  }

  /**
   * 获取任务类型名称
   */
  function getJobTypeName(name) {
    const types = {
      'anomaly-detection': '异常检测',
      'daily-report': '每日简报',
      'weekly-trends': '周趋势分析'
    };
    return types[name] || name;
  }

  /**
   * 渲染任务结果预览
   */
  function renderJobResult(job) {
    if (!job.returnvalue) return '';

    const result = job.returnvalue;

    // 异常检测结果
    if (job.name === 'anomaly-detection') {
      if (result.anomalyCount === 0) {
        return '<div class="ai-job-result success">✓ 未检测到异常</div>';
      }

      const anomalies = result.findings?.slice(0, 3).map(finding => `
        <div class="anomaly-item">
          <strong>${finding.metric}</strong>
          <span class="anomaly-change ${finding.direction === 'increase' ? 'positive' : 'negative'}">
            ${finding.direction === 'increase' ? '↑' : '↓'} ${finding.change.toFixed(1)}%
          </span>
        </div>
      `).join('') || '';

      return `
        <div class="ai-job-result">
          <div class="anomaly-summary">
            检测到 ${result.anomalyCount} 个异常
          </div>
          ${anomalies}
          ${result.anomalyCount > 3 ? '<button class="a-link" data-view-details>查看全部 →</button>' : ''}
        </div>
      `;
    }

    // 每日简报结果
    if (job.name === 'daily-report') {
      const summary = result.summary || result.report || '';
      return `
        <div class="ai-job-result">
          <div class="report-summary">${esc(summary.slice(0, 200))}${summary.length > 200 ? '...' : ''}</div>
          ${summary.length > 200 ? '<button class="a-link" data-view-details>查看完整简报 →</button>' : ''}
        </div>
      `;
    }

    return '';
  }

  /**
   * 绑定事件
   */
  function bindEvents(host) {
    // 异常检测按钮
    const anomalyBtn = host.querySelector('[data-action="anomaly-detection"]');
    if (anomalyBtn) {
      anomalyBtn.onclick = () => runAnomalyDetection();
    }

    // 每日简报按钮
    const reportBtn = host.querySelector('[data-action="daily-report"]');
    if (reportBtn) {
      reportBtn.onclick = () => runDailyReport();
    }

    // 查看详情按钮
    host.querySelectorAll('[data-view-details]').forEach(btn => {
      btn.onclick = () => {
        const jobCard = btn.closest('[data-job-id]');
        if (jobCard) {
          const jobId = jobCard.dataset.jobId;
          viewJobDetails(jobId);
        }
      };
    });
  }

  /**
   * 运行异常检测
   */
  async function runAnomalyDetection() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];

    const confirmed = confirm(`运行异常检测？\n\n日期：${date}\n指标：活跃用户、新用户、回访用户`);
    if (!confirmed) return;

    try {
      const result = await createAnomalyDetection({
        date,
        metrics: ['active_users', 'new_users', 'returning_users'],
        threshold: 15
      });

      showJobProgress(result.jobId, '异常检测');
    } catch (error) {
      alert(`创建任务失败：${error.message}`);
    }
  }

  /**
   * 运行每日简报
   */
  async function runDailyReport() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];

    const confirmed = confirm(`生成每日简报？\n\n日期：${date}`);
    if (!confirmed) return;

    try {
      const result = await createDailyReport({
        date,
        metrics: ['active_users', 'new_users', 'returning_users', 'engagement_rate']
      });

      showJobProgress(result.jobId, '每日简报');
    } catch (error) {
      alert(`创建任务失败：${error.message}`);
    }
  }

  /**
   * 显示任务进度
   */
  function showJobProgress(jobId, taskName) {
    const activeJobsSection = $('#active-jobs');
    const progressCard = document.createElement('div');
    progressCard.className = 'ai-job-progress';
    progressCard.dataset.jobId = jobId;
    progressCard.innerHTML = `
      <div class="progress-header">
        <strong>${esc(taskName)}</strong>
        ${getStatusBadge('active')}
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
      <div class="progress-info">
        <span class="progress-step">初始化中...</span>
        <span class="progress-percent">0%</span>
      </div>
    `;

    activeJobsSection.appendChild(progressCard);

    // 初始化 WebSocket（如果可用）
    initWebSocket();

    // 注册进度监听
    onJobProgress(jobId, (progress, data) => {
      updateProgress(progressCard, progress, data);
    });

    // 开始轮询
    pollJobStatus(jobId, (progress, status) => {
      updateProgress(progressCard, progress, status);

      // 任务完成
      if (status.state === 'completed' || status.state === 'failed') {
        setTimeout(() => {
          progressCard.remove();
          draw(); // 刷新列表
        }, 3000);
      }
    }).catch(error => {
      progressCard.innerHTML = `
        <div class="progress-header">
          <strong>${esc(taskName)}</strong>
          ${getStatusBadge('failed')}
        </div>
        <div class="progress-error">${esc(error.message)}</div>
      `;
      setTimeout(() => progressCard.remove(), 5000);
    });
  }

  /**
   * 更新进度显示
   */
  function updateProgress(card, progress, data) {
    const bar = card.querySelector('.progress-bar');
    const step = card.querySelector('.progress-step');
    const percent = card.querySelector('.progress-percent');

    if (bar) {
      bar.style.width = `${progress}%`;
    }

    if (percent) {
      percent.textContent = `${Math.round(progress)}%`;
    }

    if (step && data?.step) {
      step.textContent = data.step;
    }
  }

  /**
   * 查看任务详情
   */
  async function viewJobDetails(jobId) {
    try {
      const status = await getJobStatus(jobId);

      const details = JSON.stringify(status.result || status.returnvalue, null, 2);

      ctx.drawer?.open({
        title: `任务详情 - ${jobId}`,
        content: `
          <div class="job-details">
            <div class="detail-section">
              <h3>基本信息</h3>
              <table class="si-table">
                <tr><td>任务 ID</td><td>${esc(jobId)}</td></tr>
                <tr><td>任务类型</td><td>${getJobTypeName(status.name)}</td></tr>
                <tr><td>状态</td><td>${getStatusBadge(status.state)}</td></tr>
                <tr><td>创建时间</td><td>${formatTimestamp(status.timestamp)}</td></tr>
                <tr><td>完成时间</td><td>${formatTimestamp(status.finishedOn)}</td></tr>
              </table>
            </div>
            <div class="detail-section">
              <h3>执行结果</h3>
              <pre class="code-block">${esc(details)}</pre>
            </div>
          </div>
        `
      });
    } catch (error) {
      alert(`获取详情失败：${error.message}`);
    }
  }

  // 初始化
  draw();

  return {
    draw,
    cleanup: () => {
      request++;
      if (ws) {
        ws.close();
        ws = null;
      }
      jobProgressListeners = {};
    }
  };
}

