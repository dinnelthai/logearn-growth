/** Port of frontend/src/analytics/paths.js — returns aggregates without embedding user objects. */
const IDLE_MS = 30 * 60000

function computePaths(users, { startAt, endAt, asOf, startEvent = 'all', direction = 'after', stopEvent = 'none', maxSteps = 5, sourceFilter = 'all', typeSet, includeDiagnosticSessions = false }) {
  const TYPES = typeSet || new Set((function* () { for (const u of users) for (const e of u.events) yield e.type })())
  const sessions = []
  for (const user of users) {
    if (sourceFilter !== 'all' && user.source !== sourceFilter) continue
    const events = user.events
      .filter(e => TYPES.has(e.type) && e.type !== 'strategy_heartbeat' && Number.isFinite(e.t) && e.t <= asOf)
      .slice()
      .sort((a, b) => a.t - b.t)
    const groups = new Map()
    let fallback = null
    let lastFallback = -Infinity
    let index = 0
    for (const event of events) {
      let key
      if (event.session_id) {key = 'session:' + event.session_id;fallback=null;lastFallback=-Infinity}
      else {
        if (!fallback || event.t - lastFallback >= IDLE_MS) fallback = 'inferred:' + index++
        key = fallback
        lastFallback = event.t
      }
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(event)
    }
    for (const [key, group] of groups) {
      const start = startEvent === 'all' ? 0 : group.findIndex(e => (e.type === startEvent || startEvent === 'chip' && e.type === 'chip_drilldown') && e.t >= startAt && e.t < endAt)
      if (start < 0 || group[start].t < startAt || group[start].t >= endAt) continue
      const before = direction === 'before' && startEvent !== 'all'
      const context = (before ? group.slice(0,start+1) : group.slice(start)).filter(e => e.t >= startAt && e.t < endAt)
      const stopIndex = before || stopEvent === 'none' ? -1 : context.findIndex(e => e.type === stopEvent || stopEvent === 'chip' && e.type === 'chip_drilldown')
      const available = stopIndex < 0 ? context : context.slice(0, stopIndex + 1)
      const compact = []
      // A consecutive token-discovery run occupies at most one click and one detail step.
      // Other actions (including analysis/drilldown) end the run; raw events remain intact.
      let tokenRun = new Set()
      for (const event of available) {
        if (event.type === 'token_click' || event.type === 'token') {
          if (!tokenRun.has(event.type)) compact.push(event)
          tokenRun.add(event.type)
        } else {
          tokenRun = new Set()
          if (compact.at(-1)?.type !== event.type) compact.push(event)
        }
      }
      if (!compact.length) continue
      const visible = before ? compact.slice(-maxSteps) : stopIndex >= 0 ? compact : compact.slice(0, maxSteps)
      const terminal = before || stopIndex >= 0 ? 'reached' : compact.length > maxSteps
        ? 'more'
        : group.some(e => e.t >= endAt)
          ? 'boundary'
          : asOf - available.at(-1).t < IDLE_MS
            ? 'pending'
            : 'end'
      sessions.push({
        userId: user.id,
        key: user.id + ':' + key,
        types: visible.map(e => e.type),
        terminal,
        inferred: key.startsWith('inferred:'),
        observedEvents: available,
        visibleEvents: visible,
      })
    }
  }

  const paths = new Map()
  const links = new Map()
  const nodes = new Map()
  for (const session of sessions) {
    const pathKey = JSON.stringify([session.types, session.terminal])
    if (!paths.has(pathKey)) paths.set(pathKey, { path_key: pathKey, types: session.types, terminal: session.terminal, userIds: new Set(), sessions: 0 })
    const p = paths.get(pathKey)
    p.userIds.add(session.userId)
    p.sessions++

    const sequence = [...session.types, session.terminal].map((type, stage) => ({ name: stage + ':' + type, type, stage }))
    for (const node of sequence) {
      if (!nodes.has(node.name)) nodes.set(node.name, { ...node, userIds: new Set(), incoming: 0, outgoing: 0 })
      nodes.get(node.name).userIds.add(session.userId)
    }
    for (let i = 0; i < sequence.length - 1; i++) {
      const source = sequence[i].name
      const target = sequence[i + 1].name
      const k = source + '>' + target
      if (!links.has(k)) links.set(k, { link_key: k, source, target, value: 0, userIds: new Set() })
      const link = links.get(k)
      link.value++
      link.userIds.add(session.userId)
      nodes.get(source).outgoing++
      nodes.get(target).incoming++
    }
  }

  const ranked = [...paths.values()]
    .map(p => ({
      path_key: p.path_key,
      types: p.types,
      terminal: p.terminal,
      sessions: p.sessions,
      users: p.userIds.size,
      user_ids: [...p.userIds],
    }))
    .sort((a, b) => b.sessions - a.sessions)

  const linkList = [...links.values()].map(l => ({
    link_key: l.link_key,
    source: l.source,
    target: l.target,
    value: l.value,
    user_ids: [...l.userIds],
  }))

  const nodeList = [...nodes.values()].map(({userIds, incoming, outgoing, ...node}) => ({
    user_ids: [...userIds], ...node, value: Math.max(incoming, outgoing),
  }))
  const userIds = new Set(), terminals = new Map(['reached','end','pending','boundary','more'].map(t => [t, {sessions: 0, users: new Set()}]))
  let inferred = 0, steps = 0
  for (const session of sessions) {
    userIds.add(session.userId)
    const terminal = terminals.get(session.terminal)
    terminal.sessions++; terminal.users.add(session.userId)
    inferred += Number(session.inferred); steps += session.types.length
  }

  return {
    ...(includeDiagnosticSessions?{diagnostic_sessions:sessions}:{}),
    user_ids: [...userIds],
    terminal_counts: Object.fromEntries([...terminals].map(([t, v]) => [t, {sessions: v.sessions, user_ids: [...v.users]}])),
    sessions: sessions.length,
    users: userIds.size,
    inferred_sessions: inferred,
    average_steps: sessions.length ? steps / sessions.length : 0,
    paths: ranked,
    nodes: nodeList,
    links: linkList,
  }
}

module.exports = { computePaths, IDLE_MS }
