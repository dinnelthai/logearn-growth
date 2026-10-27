const test=require('node:test'),assert=require('node:assert/strict')
const {computePaths}=require('../src/analytics/paths')
const {pathDiagnostics,createEventResolver}=require('../src/analytics/pathDiagnostics')
test('many sessions retain exact distinct membership and flow counts at every stage',()=>{
 const users=Array.from({length:20},(_,u)=>({id:'u'+u,events:Array.from({length:100},(_,i)=>({type:i%2?'chip':'token',t:i+1,session_id:'s'+Math.floor(i/2)}))}))
 const r=computePaths(users,{startAt:0,endAt:1000,asOf:3000000})
 assert.equal(r.sessions,1000);assert.equal(r.paths.length,1);assert.equal(r.paths[0].sessions,1000);assert.equal(r.paths[0].users,20)
 for(const n of r.nodes){assert.equal(n.value,1000);assert.deepEqual(n.user_ids,users.map(u=>u.id))}
 for(const l of r.links){assert.equal(l.value,1000);assert.deepEqual(l.user_ids,users.map(u=>u.id))}
 assert.deepEqual(r.terminal_counts.end,{sessions:1000,user_ids:users.map(u=>u.id)})
 assert.equal(r.average_steps,2)
})
test('stopping paths preserve all steps beyond display depth and inferred boundaries',()=>{
 const events=Array.from({length:80},(_,i)=>({type:i===79?'trade':i%2?'chip':'token',t:i+1,session_id:'s'}))
 events.push({type:'login',t:100},{type:'login',t:2000000})
 const r=computePaths([{id:'u',events}],{startAt:0,endAt:3000000,asOf:6000000,stopEvent:'trade',maxSteps:3})
 assert.equal(r.paths.find(p=>p.terminal==='reached').types.length,80);assert.equal(r.inferred_sessions,2)
 assert.equal(r.nodes.find(n=>n.name==='80:reached').value,1)
})
test('event decoding cache is shared within one analysis and released across analyses',()=>{
 let reads=0
 const event={get ua(){reads++;return 'Windows Chrome/156.0'},page_url:'/cn',device:'desktop'}
 const sessions=[{userId:'u',observedEvents:[event],visibleEvents:[event]}],resolve=createEventResolver()
 const expected=pathDiagnostics(sessions,0,resolve)
 assert.deepEqual(pathDiagnostics(sessions,null,resolve),expected);assert.equal(reads,1)
 pathDiagnostics(sessions,0,createEventResolver());assert.equal(reads,2)
})
