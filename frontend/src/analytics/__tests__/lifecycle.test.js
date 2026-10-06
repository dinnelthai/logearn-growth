import {describe,it,expect} from 'vitest'
import {evaluateLifecycle,defaultRules,deliveryOutcome} from '../../lifecycle/rules.js'
import {lifecycleDemoUsers} from '../../lifecycle/mock.js'
import {runLifecycleBatch} from '../../lifecycle/worker.js'
const DAY=86400000,now=100*DAY
const rules=defaultRules()
describe('lifecycle outreach',()=>{
 it('covers six scenes and chooses only one per user',()=>{
  const users=lifecycleDemoUsers(now),r=evaluateLifecycle(users,{asOf:now,rules})
  expect(new Set(r.filter(c=>c.eligible).map(c=>c.rule_id)).size).toBe(6)
  expect(r.filter(c=>c.eligible)).toHaveLength(6)
 })
 it('requires binding and consent, honors frequency and disabled rules',()=>{
  const users=lifecycleDemoUsers(now)
  users[0].notification_preferences={telegram:false,email:false}
  const deliveries=[{user_id:users[1].id,rule_id:'core',sent_at:now-1000,status:'sent'},{user_id:users[3].id,rule_id:'inactive_3d',sent_at:now-2*DAY,status:'sent'}]
  const r=evaluateLifecycle(users,{asOf:now,rules:rules.map(r=>({...r,enabled:r.id!=='churned'})),deliveries})
  expect(r.find(c=>c.u.id===users[0].id).reason).toContain('未订阅')
  expect(r.find(c=>c.u.id===users[1].id).reason).toBe('24小时频控')
  expect(r.find(c=>c.u.id===users[3].id&&c.rule_id==='inactive_3d').reason).toBe('同场景7天冷却')
  expect(r.some(c=>c.rule_id==='churned')).toBe(false)
 })
 it('requires actual generated result and matching signal view',()=>{
  const user=lifecycleDemoUsers(now)[2]
  user.events.push({type:'signal_view',t:now-1000,result_id:'other',strategy_run_id:'run-demo'})
  expect(evaluateLifecycle([user],{asOf:now}).some(c=>c.rule_id==='view_signal')).toBe(true)
  user.events.push({type:'signal_view',t:now-500,result_id:'result-demo',strategy_run_id:'run-demo'})
  expect(evaluateLifecycle([user],{asOf:now}).some(c=>c.rule_id==='view_signal')).toBe(false)
  user.events=user.events.filter(e=>e.type!=='strategy_result')
  expect(evaluateLifecycle([user],{asOf:now}).some(c=>c.rule_id==='view_signal')).toBe(false)
 })
 it('marks goals pending and observes only matching goals after sending',()=>{
  const d={rule_id:'view_signal',sent_at:now,status:'sent',strategy_run_id:'run',result_id:'result'},u={events:[]}
  expect(deliveryOutcome(d,u,now+1000)).toBe('待观察')
  u.events.push({type:'signal_view',t:now+1000,strategy_run_id:'other',result_id:'result'})
  expect(deliveryOutcome(d,u,now+DAY)).toBe('24h内未完成目标')
  u.events.push({type:'signal_view',t:now+2000,strategy_run_id:'run',result_id:'result'})
  expect(deliveryOutcome(d,u,now+DAY)).toBe('24h内完成目标')
 })
 it('worker rechecks target before dispatch and respects atomic reservation',async()=>{
  const user=lifecycleDemoUsers(now)[0];let loads=0,sends=0
  await runLifecycleBatch({now:()=>now,loadState:async()=>({users:[{...user,events:++loads>1?[...user.events,{type:'chip',t:now-1000}]:user.events}],rules,deliveries:[]}),reserve:async()=>({id:'r'}),send:async()=>{sends++},record:async()=>{}})
  expect(sends).toBe(0)
  await runLifecycleBatch({now:()=>now,loadState:async()=>({users:[user],rules,deliveries:[]}),reserve:async()=>null,send:async()=>{sends++},record:async()=>{}})
  expect(sends).toBe(0)
 })
})
