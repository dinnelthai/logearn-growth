const {test}=require('node:test'),assert=require('node:assert/strict'),{weeklyCoreWindow,weeklyCore}=require('../src/analytics/weeklyCore')
const DAY=86400000,end=Date.parse('2026-10-24T00:00:00+07:00'),s={snapshot_id:'s',as_of:new Date(end+12*3600000).toISOString(),history_complete:false}
test('seven complete UTC+7 dates are independent of report length; historical and future cutoffs clamp correctly',()=>{
 const w=weeklyCoreWindow(Date.parse(s.as_of));assert.equal(w.end,end);assert.equal(w.start,end-7*DAY);assert.equal(w.previous_end,w.start)
 assert.equal(weeklyCoreWindow(Date.parse(s.as_of),end+10*DAY).end,end)
 assert.equal(weeklyCoreWindow(Date.parse(s.as_of),end-3*DAY+100).end,end-3*DAY)
 assert.equal(weeklyCoreWindow(end-2).end,end-DAY);assert.equal(weeklyCoreWindow(end-1).end,end);assert.equal(weeklyCoreWindow(end).end,end)
 for(const value of [NaN,1.5,-1])assert.throws(()=>weeklyCoreWindow(Date.parse(s.as_of),value))
})
test('four-day threshold, near-core groups and lifecycle reconcile with exact lists and goal',()=>{
 const rows=[{user_key:'user:1',source:'x',current_days:4,previous_days:3},{user_key:'user:2',current_days:7,previous_days:6},{user_key:'user:3',current_days:3,previous_days:4},{user_key:'user:4',current_days:0,previous_days:4},{user_key:'anonymous:a',current_days:2,previous_days:0},{user_key:'user:5',current_days:1,previous_days:0}]
 const r=weeklyCore(rows,weeklyCoreWindow(Date.parse(s.as_of)),s),m=r.payload
 assert.equal(m.users,2);assert.equal(m.retained,1);assert.equal(m.entered,1);assert.equal(m.lost,2);assert.equal(m.delta,-1);assert.equal(m.near_users,2);assert.equal(m.weekly_users,5);assert.equal(m.goal.progress,.01)
 assert.equal(m.users,m.retained+m.entered);assert.equal(m.previous_users,m.retained+m.lost)
 assert.deepEqual(r.lists.core,['user:1','user:2']);assert.deepEqual(r.lists.near,['user:3','anonymous:a']);assert.equal(r.members['user:1'].analysis_days,4)
 assert.equal(weeklyCore(rows,weeklyCoreWindow(Date.parse(s.as_of)),s,'x').payload.goal.progress,null)
 assert.equal(weeklyCore([],weeklyCoreWindow(Date.parse(s.as_of)),s).payload.users,0)
})
