const DAY = 86400000, TZ = 25200000
const dayStart = t => Math.floor((t + TZ) / DAY) * DAY - TZ
const date = t => new Date(t + TZ).toISOString().slice(0, 10)
const DEFINITIONS = {
  activation: ['新访客首次筹码分析完成率', '首次页面访问后24小时内完成首次筹码分析的新访客 / 新访客'],
  visit_login: ['页面访问 → 登录成功率', '页面访问后24小时内主动登录成功的用户 / 页面访问用户'],
  login_analysis: ['登录成功 → 首次筹码分析完成率', '登录成功后24小时内完成首次筹码分析的用户 / 尚未分析的主动登录用户'],
  login_success: ['登录发起 → 登录成功率', '点击登录按钮后24小时内主动登录成功的用户 / 点击登录按钮用户'],
  trial: ['免费试用开启率', '首次登录后24小时内开启试用的用户 / 首次主动登录用户'],
  d1: ['首次分析后 D1 回访率', '首次分析次日有页面访问或筹码分析的用户 / 次日观察已结束的首次分析用户'],
  d7: ['首次分析后 D7 回访率', '首次分析第7日有页面访问或筹码分析的用户 / 第7日观察已结束的首次分析用户'],
}
function computeMyMonitor(records, {start, end, asOf, historyComplete = false, availability = {}}) {
  const window = DAY, inRange = t => t != null && t >= start && t < end && t <= asOf
  const has = (times, t) => times.some(x => x >= t && x <= Math.min(t + window, asOf))
  function calculate(a, b) {
    const metrics = Object.fromEntries(Object.entries(DEFINITIONS).map(([key, [label, formula]]) => [key, {key, label, formula, numerator: 0, denominator: 0, pending: 0}]))
    const inside = t => inRange(t) && t >= a && t < b
    for (const u of records) {
      const pages = u.pages || [], logins = u.logins || [], starts = u.starts || [], trials = u.trials || [], analyses = u.analyses || []
      const add = (key, t, success) => {const m = metrics[key]; m.denominator++; if(success)m.numerator++; if(t + window > asOf)m.pending++}
      // New = first observed page, with no observed activity on an earlier business day.
      if(inside(u.first_page) && (u.first_seen == null || dayStart(u.first_seen) === dayStart(u.first_page))) add('activation', u.first_page, u.first_chip != null && has([u.first_chip], u.first_page))
      const visit = pages.filter(inside)
      if(visit.length) add('visit_login', visit.reduce((a,b)=>Math.max(a,b),-Infinity), visit.some(t => has(logins, t)))
      const eligibleLogin = logins.filter(t => inside(t) && (u.first_chip == null || u.first_chip >= t))
      if(eligibleLogin.length) add('login_analysis', eligibleLogin.reduce((a,b)=>Math.max(a,b),-Infinity), u.first_chip != null && eligibleLogin.some(t => has([u.first_chip], t)))
      const attempts = starts.filter(inside)
      if(attempts.length) add('login_success', attempts.reduce((a,b)=>Math.max(a,b),-Infinity), attempts.some(t => has(logins, t)))
      if(inside(u.first_login)) add('trial', u.first_login, has(trials, u.first_login))
      if(inside(u.first_chip)) for(const n of [1, 7]) {
        const m = metrics['d'+n], target = dayStart(u.first_chip) + n * DAY
        if(target + DAY > asOf + 1){m.pending++; continue}
        m.denominator++
        if([...pages, ...analyses].some(t => t >= target && t < target + DAY && t <= asOf))m.numerator++
      }
    }
    for(const m of Object.values(metrics)) {
      const needs = {activation:['pages','analysis'],visit_login:['pages','login'],login_analysis:['login','analysis'],login_success:['starts','login'],trial:['login','trial'],d1:['analysis'],d7:['analysis']}[m.key]
      m.available = needs.every(k => availability[k] !== false)
      m.missing = needs.filter(k => availability[k] === false)
      m.rate = m.available && m.denominator ? m.numerator / m.denominator : null
    }
    return metrics
  }
  const days = []
  for(let t = dayStart(start); t < end; t += DAY)days.push({date: date(t), metrics: calculate(Math.max(t,start), Math.min(t+DAY,end))})
  return {metrics: calculate(start,end), days, meta: {as_of:new Date(asOf).toISOString(),history_complete:historyComplete,timezone:'Asia/Bangkok',window_hours:24}, availability}
}
module.exports = {computeMyMonitor, DEFINITIONS, dayStart}
