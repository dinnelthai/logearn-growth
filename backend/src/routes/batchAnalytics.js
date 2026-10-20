const express = require('express')
const router = express.Router()

/**
 * 批量分析查询接口
 * 单次请求获取多个指标，减少 RTT 延迟
 *
 * POST /api/batch-analytics
 * Body: {
 *   snapshot_id: 'abc123',
 *   queries: [
 *     { type: 'north-star', params: { start, end, source: 'all' } },
 *     { type: 'funnel', params: { steps: [...], start, end } },
 *     { type: 'retention', params: { initial: 'chip', returning: 'chip' } }
 *   ]
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { snapshot_id, queries } = req.body
    const owner = req.user.user_id

    // 参数校验
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: '请提供至少一个查询' })
    }

    if (queries.length > 10) {
      return res.status(400).json({ error: '单次批量查询不能超过 10 个' })
    }

    // 获取快照
    const remote = require('../data/hologres')
    const snapshot = snapshot_id
      ? await remote.snapshot(snapshot_id)
      : await remote.status()

    // 并行执行所有查询
    const results = await Promise.allSettled(
      queries.map(async (query, index) => {
        const { type, params } = query

        // 基础参数验证
        if (!type || typeof type !== 'string') {
          throw Object.assign(new Error(`查询 ${index}: 缺少 type`), { status: 400 })
        }

        // 根据类型执行分析
        return executeQuery(type, params, snapshot, owner)
      })
    )

    // 格式化响应
    const response = {
      snapshot_id: snapshot.snapshot_id,
      as_of: snapshot.as_of,
      results: results.map((result, index) => ({
        type: queries[index].type,
        status: result.status,
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? {
          message: result.reason.message,
          status: result.reason.status || 500
        } : null,
      }))
    }

    res.json(response)
  } catch (err) {
    next(err)
  }
})

/**
 * 执行单个查询
 */
async function executeQuery(type, params, snapshot, owner) {
  const { start, end, source = 'all' } = params || {}

  switch (type) {
    case 'status':
      return snapshot

    case 'home-overview': {
      const { homeOverview } = require('../analytics/homeOverview')
      const { features } = require('../data/remoteUsers')
      const rows = await features(snapshot, source, null, { start, end })
      return homeOverview(rows, { start, end, asOf: Date.parse(snapshot.as_of) })
    }

    case 'growth-insights': {
      const { growthFacts, growthQuality, cohortTrades } = require('../data/growthInsights')
      const rows = await growthFacts(snapshot, { start, end, source }, null)
      const quality = await growthQuality(snapshot, { start, end, source }, null)
      const trades = await cohortTrades(snapshot, rows, { start, end })
      return require('../analytics/growthInsights').growthInsights(rows, quality, { start, end, source }, snapshot, trades)
    }

    case 'channels': {
      const { channelFacts } = require('../data/channelFacts')
      const { channelInsights } = require('../analytics/channelInsights')
      const facts = await channelFacts(snapshot, { start, end, source }, null)
      return channelInsights(facts, { start, end, source }, snapshot)
    }

    case 'funnel': {
      const { orderedFunnelUsers } = require('../data/remoteUsers')
      const { computeFunnel } = require('../analytics/funnel')
      const { steps, hours = 24, association = 'user' } = params

      if (!Array.isArray(steps) || steps.length < 2) {
        throw Object.assign(new Error('漏斗至少需要 2 个步骤'), { status: 400 })
      }

      const users = association === 'user'
        ? await orderedFunnelUsers(snapshot, params, null)
        : await require('../data/remoteUsers').loadUsers(snapshot, {
            types: steps,
            start,
            end: Math.min(Date.parse(snapshot.as_of) + 1, end + hours * 3600000),
            source,
            audience: null
          })

      const result = computeFunnel(users, {
        steps,
        startAt: start,
        endAt: end,
        asOf: Date.parse(snapshot.as_of),
        conversionWindowMs: hours * 3600000,
        association,
        sourceFilter: source,
      })

      return result
    }

    case 'retention': {
      const { retentionUsers } = require('../data/remoteUsers')
      const { computeRetention } = require('../analytics/retention')
      const { initial = 'chip', returning = 'chip' } = params

      const users = await retentionUsers(snapshot, {
        initial,
        returning,
        start,
        end,
        source,
        audience: null,
        maxDailyPeriods: 7
      })

      return computeRetention(users, {
        initial,
        returning,
        start,
        end,
        asOf: Date.parse(snapshot.as_of),
      })
    }

    case 'trade-monitor': {
      const { tradeEvents } = require('../data/tradeEvents')
      const { computeTradeInsights } = require('../analytics/tradeInsights')
      const { chain = 'all' } = params

      const events = await tradeEvents(snapshot, { start, end, source, chain }, null)
      return computeTradeInsights(events, {
        start,
        end,
        asOf: Date.parse(snapshot.as_of),
        chain
      })
    }

    case 'referral': {
      const { features } = require('../data/remoteUsers')
      const { referralFacts } = require('../data/referralFacts')
      const { computeReferralInsights } = require('../analytics/referralInsights')

      const [rows, relations] = await Promise.all([
        features(snapshot),
        referralFacts(snapshot)
      ])

      return computeReferralInsights(rows, relations, {
        start,
        end,
        asOf: Date.parse(snapshot.as_of),
        factsAsOf: Date.parse(snapshot.snapshot_cutoff),
        scope: params.scope || 'all',
        quality: params.quality || 'all',
        source,
        inviter: params.inviter || null,
        windowDays: params.window_days || 28,
        audience: null
      })
    }

    default:
      throw Object.assign(new Error(`不支持的查询类型: ${type}`), { status: 400 })
  }
}

module.exports = router
