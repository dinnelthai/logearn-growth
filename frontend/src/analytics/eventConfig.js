/**
 * eventConfig.js
 *
 * Single source of truth for every tracked event in the logearn_growth system.
 * Each entry records the raw event_name sent by the client, the internal type
 * key used throughout the analytics pipeline, the display label, the source
 * file that fires it, and a one-line description of when it fires.
 *
 * RAW_EVENT_TYPES and EVENT_LABELS in events.js are derived from this list.
 * When adding a new event, add it here first, then run the sync check.
 */

/** @typedef {{ rawName: string, type: string, label: string, source: string, description: string, northStar?: boolean }} EventDef */

/** @type {EventDef[]} */
export const EVENT_CONFIG = [
  // ─── Identity / Auth ─── auth.ts ───────────────────────────────────────────
  {
    rawName: 'app_opened_unauthenticated',
    type: 'app_open',
    label: '未登录打开 App',
    source: 'auth.ts',
    description: '用户在未登录状态下打开 App，properties.page 含落地路径',
  },
  {
    rawName: 'login_button_clicked',
    type: 'login_click',
    label: '点击登录按钮',
    source: 'auth.ts',
    description: '用户点击登录按钮，properties.source 含入口位置（header / modal / etc.）',
  },
  {
    rawName: 'wallet_connect_submitted',
    type: 'wallet_connect_submitted',
    label: '发起钱包连接',
    source: 'auth.ts',
    description: '用户点击某钱包发起连接',
  },
  {
    rawName: 'wallet_connect_succeeded',
    type: 'wallet_connected',
    label: '钱包连接成功',
    source: 'auth.ts',
    description: '钱包连接成功',
  },
  {
    rawName: 'wallet_connect_failed',
    type: 'wallet_connect_failed',
    label: '钱包连接失败',
    source: 'auth.ts',
    description: '钱包连接失败，properties.error 含失败原因',
  },
  {
    rawName: 'login_succeeded',
    type: 'login',
    label: '登录成功',
    source: 'auth.ts',
    description: '登录成功；session 级去重，autoLogin 不上报',
  },
  {
    rawName: 'logout',
    type: 'logout',
    label: '登出',
    source: 'auth.ts',
    description: '登出 / 断开连接',
  },

  // ─── Navigation / Discovery ─── navigation.ts ──────────────────────────────
  {
    rawName: 'page_viewed',
    type: 'page_view',
    label: '页面浏览',
    source: 'navigation.ts',
    description: '页面浏览，properties 含 path 和路由名',
  },
  {
    rawName: 'token_detail_viewed',
    type: 'token',
    label: 'Token 详情页',
    source: 'navigation.ts',
    description: '进入 token 详情页，properties 含来源入口',
  },
  {
    rawName: 'token_detail_tab_switched',
    type: 'token_tab',
    label: '详情页切换 Tab',
    source: 'navigation.ts',
    description: '详情页切换 tab（筹码/持有者/信号等），properties 含 tab 名',
  },
  {
    rawName: 'search_performed',
    type: 'search',
    label: '执行搜索',
    source: 'navigation.ts',
    description: '执行搜索，properties 含结果数；不记录关键词原文（PII）',
  },
  {
    rawName: 'ranking_token_clicked',
    type: 'token_click',
    label: '点击 Token',
    source: 'navigation.ts',
    description: '点击榜单里的某个 token，properties 含榜单类型和排名',
  },
  {
    rawName: 'language_changed',
    type: 'language_changed',
    label: '切换语言',
    source: 'navigation.ts',
    description: '主动切换语言，properties 含 lang（新）和 from_lang（旧）',
  },

  // ─── Core Analysis ─── analysis.ts ─────────────────────────────────────────
  {
    rawName: 'chip_analysis_viewed',
    type: 'chip',
    label: '有效分析（筹码峰）',
    source: 'analysis.ts',
    description: '★★ 北极星：筹码峰有效展示（IntersectionObserver + session 去重，缓存命中也算）',
    northStar: true,
  },
  {
    rawName: 'chip_analysis_drilldown',
    type: 'chip_drilldown',
    label: '筹码分析下钻',
    source: 'analysis.ts',
    description: '筹码分析下钻（圈选 / 内盘 / 全生命周期等），properties 含 drill_type',
  },
  {
    rawName: 'holders_analysis_viewed',
    type: 'holders',
    label: '持有者分析视图',
    source: 'analysis.ts',
    description: '持有者分析视图展示',
  },
  {
    rawName: 'cluster_explorer_opened',
    type: 'cluster',
    label: '打开聚类探查器',
    source: 'analysis.ts',
    description: '打开聚类 / 关联钱包探查器',
  },

  // ─── Signals ─── signals.ts ─────────────────────────────────────────────────
  {
    rawName: 'signal_viewed',
    type: 'signal_view',
    label: '查看策略信号',
    source: 'signals.ts',
    description: '信号被展示给用户，properties 含信号类型和展示位置',
  },
  {
    rawName: 'signal_clicked',
    type: 'signal_click',
    label: '点击信号',
    source: 'signals.ts',
    description: '用户点击某条信号（通常跳详情）',
  },
  {
    rawName: 'callout_card_clicked',
    type: 'callout_click',
    label: '点击喊单卡片',
    source: 'signals.ts',
    description: '全局喊单面板点击 card 跳转详情页，properties 含 token、平台、喊单者、卡片类型',
  },

  // ─── Trade ─── trade.ts ─────────────────────────────────────────────────────
  {
    rawName: 'trade_submitted',
    type: 'trade_submitted',
    label: '提交交易',
    source: 'trade.ts',
    description: '用户点确认 / 发起下单',
  },
  {
    rawName: 'trade_succeeded',
    type: 'trade',
    label: '交易确认',
    source: 'trade.ts',
    description: '交易成功（链上 / 后端确认）',
  },
  {
    rawName: 'trade_failed',
    type: 'trade_failed',
    label: '交易失败',
    source: 'trade.ts',
    description: '交易失败，properties.error 含失败原因',
  },
  {
    rawName: 'limit_order_created',
    type: 'limit_order',
    label: '创建限价单',
    source: 'trade.ts',
    description: '创建限价单',
  },
  {
    rawName: 'dca_order_created',
    type: 'dca_order',
    label: '创建 DCA 订单',
    source: 'trade.ts',
    description: '创建 DCA 定投订单',
  },

  // ─── Follow ─── follow.ts ───────────────────────────────────────────────────
  {
    rawName: 'token_followed',
    type: 'token_follow',
    label: '关注 Token',
    source: 'follow.ts',
    description: '关注 token',
  },
  {
    rawName: 'token_unfollowed',
    type: 'token_unfollow',
    label: '取关 Token',
    source: 'follow.ts',
    description: '取消关注 token',
  },
  {
    rawName: 'address_followed',
    type: 'address_follow',
    label: '关注地址',
    source: 'follow.ts',
    description: '关注地址（聪明钱 / KOL）',
  },
  {
    rawName: 'address_unfollowed',
    type: 'address_unfollow',
    label: '取关地址',
    source: 'follow.ts',
    description: '取消关注地址',
  },

  // ─── AI Strategy ─── strategy.ts ────────────────────────────────────────────
  {
    rawName: 'strategy_started',
    type: 'ai',
    label: '实际开启 AI 策略',
    source: 'strategy.ts',
    description: '★ 策略从停止 / 暂停切为实际开启；三元 key 去重，刷新恢复不重报',
  },
  {
    rawName: 'strategy_stopped',
    type: 'strategy_stopped',
    label: '策略停止/暂停',
    source: 'strategy.ts',
    description: '策略正常停止 / 暂停',
  },
  {
    rawName: 'strategy_heartbeat',
    type: 'strategy_heartbeat',
    label: '策略运行心跳',
    source: 'strategy.ts',
    description: '策略运行心跳，每 60s 一次，仅真实开启时发',
  },
  {
    rawName: 'strategy_created',
    type: 'strategy_created',
    label: '新建策略',
    source: 'strategy.ts',
    description: '新建策略配置',
  },
  {
    rawName: 'strategy_edited',
    type: 'strategy_edited',
    label: '编辑策略',
    source: 'strategy.ts',
    description: '编辑策略配置',
  },
  {
    rawName: 'strategy_deleted',
    type: 'strategy_deleted',
    label: '删除策略',
    source: 'strategy.ts',
    description: '删除策略',
  },
  {
    rawName: 'strategy_backtesting_run',
    type: 'backtest',
    label: '运行回测',
    source: 'strategy.ts',
    description: '运行策略回测',
  },
  {
    rawName: 'strategy_result_generated',
    type: 'strategy_result',
    label: '策略结果已生成',
    source: 'strategy.ts',
    description: '策略结果生成（后端事件，不由前端触发）',
  },

  // ─── Growth / Incentive ─── growth.ts ───────────────────────────────────────
  {
    rawName: 'mint_submitted',
    type: 'mint_submitted',
    label: '发起 Mint',
    source: 'growth.ts',
    description: '发起 mint',
  },
  {
    rawName: 'mint_succeeded',
    type: 'mint_succeeded',
    label: 'Mint 成功',
    source: 'growth.ts',
    description: 'mint 成功',
  },
  {
    rawName: 'reward_claimed',
    type: 'reward_claimed',
    label: '领取奖励',
    source: 'growth.ts',
    description: '领取奖励',
  },
  {
    rawName: 'invite_link_copied',
    type: 'invite_copy',
    label: '复制邀请链接',
    source: 'growth.ts',
    description: '复制邀请链接，properties 含来源入口',
  },
  {
    rawName: 'notification_clicked',
    type: 'notification_click',
    label: '点击通知',
    source: 'growth.ts',
    description: '点击通知，properties 含通知类型',
  },
  {
    rawName: 'invite_page_entered',
    type: 'invite_page',
    label: '进入邀请返佣页',
    source: 'growth.ts',
    description: '进入邀请返佣页，properties.entry 含入口来源（wallet_menu / rewards_page / other）',
  },
  {
    rawName: 'first_visit_captured',
    type: 'first_visit',
    label: '首次访问',
    source: 'growth.ts',
    description: '首次访问捕获，每个 anonymous_id 终生一次；properties 含 first_referrer_url、first_landing_url、first_visit_at',
  },

  // ─── Legacy aliases (kept for historical data compatibility) ────────────────
  { rawName: 'token_opened',           type: 'token_click',    label: '点击 Token',      source: 'legacy', description: 'token_opened 旧名，已改为 ranking_token_clicked' },
  { rawName: 'strategy_signal_viewed', type: 'signal_view',    label: '查看策略信号',    source: 'legacy', description: 'strategy_signal_viewed 旧名，已改为 signal_viewed' },
  { rawName: 'share_button_clicked',   type: 'share_click',    label: '点击分享',        source: 'legacy', description: 'share_button_clicked 旧名' },
  { rawName: 'share_completed',        type: 'share_complete', label: '完成分享操作',    source: 'legacy', description: 'share_completed 旧名' },
  { rawName: 'invite_link_visited',    type: 'invite_visit',   label: '邀请链接访问',    source: 'legacy', description: 'invite_link_visited 旧名' },
]

/**
 * Derived lookup maps — generated from EVENT_CONFIG so they stay in sync.
 * Import these in place of the hand-maintained objects in events.js.
 */

/** raw event_name → internal type key (null = handled via separate code path) */
export const RAW_EVENT_TYPES = Object.fromEntries(
  EVENT_CONFIG.map(e => [e.rawName, e.type])
)

/** internal type key → Chinese display label */
export const EVENT_LABELS = Object.fromEntries(
  EVENT_CONFIG.map(e => [e.type, e.label])
)

/** internal type key → full EventDef (for description, source, northStar flag) */
export const EVENT_META = Object.fromEntries(
  EVENT_CONFIG.map(e => [e.type, e])
)
