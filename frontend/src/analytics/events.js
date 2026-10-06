/** Shared event vocabulary for ingestion, paths and saved configurations. */
export const MODULES = { callouts: '喊单', signals: '信号榜单', popular: '热门', fomo: 'FOMO 热门' }
export const EVENT_LABELS = {
  strategy_result: '策略结果已生成', signal_view: '查看策略信号', share_click: '点击分享', share_complete: '完成分享操作', invite_visit: '邀请链接访问', login: '登录成功', callouts: '喊单', signals: '信号榜单', popular: '热门', fomo: 'FOMO 热门',
  token_click: '点击 Token', token: 'Token 详情页', ai: '实际开启 AI 策略', chip: '有效分析（筹码峰）', trade: '交易',
}
export const RAW_EVENT_TYPES = {
  strategy_result_generated: 'strategy_result', strategy_signal_viewed: 'signal_view', share_button_clicked: 'share_click', share_completed: 'share_complete', invite_link_visited: 'invite_visit', login_succeeded: 'login', module_viewed: null, token_opened: 'token_click',
  token_detail_viewed: 'token', strategy_started: 'ai', chip_analysis_viewed: 'chip',
}
