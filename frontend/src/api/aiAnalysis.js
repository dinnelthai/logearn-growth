/**
 * AI 分析 API 客户端
 */
import { getToken } from '../auth/authClient.js';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001';

async function aiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error(body.error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }

  return body;
}

/**
 * 创建异常检测任务
 */
export async function createAnomalyDetection({ date, metrics, threshold, source = 'all' }) {
  return aiFetch('/api/queue/ai-analysis', {
    method: 'POST',
    body: JSON.stringify({
      type: 'anomaly-detection',
      data: { date, metrics, threshold, source },
      priority: 1
    })
  });
}

/**
 * 创建每日简报任务
 */
export async function createDailyReport({ date, metrics, source = 'all' }) {
  return aiFetch('/api/queue/ai-analysis', {
    method: 'POST',
    body: JSON.stringify({
      type: 'daily-report',
      data: { date, metrics, source },
      priority: 2
    })
  });
}

/**
 * 获取任务状态
 */
export async function getJobStatus(jobId, queueName = 'ai-analysis') {
  return aiFetch(`/api/queue/jobs/${queueName}/${jobId}`);
}

/**
 * 获取队列统计
 */
export async function getQueueStats(queueName = 'ai-analysis') {
  return aiFetch(`/api/queue/stats/${queueName}`);
}

/**
 * 获取最近完成的任务
 */
export async function getRecentJobs(queueName = 'ai-analysis', state = 'completed', limit = 10) {
  const qs = new URLSearchParams({ state, limit: String(limit) });
  return aiFetch(`/api/queue/${queueName}/jobs?${qs}`);
}

/**
 * 获取可用模型列表
 */
export async function getAvailableModels() {
  return aiFetch('/api/ai/models');
}

/**
 * 获取今日使用统计
 */
export async function getTodayUsage() {
  return aiFetch('/api/ai/usage/today');
}

/**
 * 获取使用历史统计
 */
export async function getUsageHistory(days = 7) {
  const qs = new URLSearchParams({ days: String(days) });
  return aiFetch(`/api/ai/usage/history?${qs}`);
}

/**
 * 对比不同模型
 */
export async function compareModels(days = 7) {
  const qs = new URLSearchParams({ days: String(days) });
  return aiFetch(`/api/ai/usage/compare?${qs}`);
}
