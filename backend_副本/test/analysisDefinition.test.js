const {test}=require('node:test')
const assert=require('node:assert/strict')
const {TYPE_TO_RAWS,internalType}=require('../src/analytics/eventMap')
const {ANALYSIS_SQL}=require('../src/data/analysisUsers')
const {computeFunnel}=require('../src/analytics/funnel')
test('north-star and funnel share chip view/drilldown union; both actions count one user',()=>{
 assert.deepEqual(TYPE_TO_RAWS.chip,['chip_analysis_viewed','chip_analysis_drilldown'])
 assert.equal(ANALYSIS_SQL,"'chip_analysis_viewed','chip_analysis_drilldown'")
 const users=[{id:'user:1',source:'direct',events:[{type:'login',t:1},...TYPE_TO_RAWS.chip.map((name,i)=>({type:internalType(name),t:i+2}))]}]
 const r=computeFunnel(users,{steps:['login','chip'],startAt:0,endAt:10,asOf:10})
 assert.equal(r.total_converted,1);assert.equal(r.steps[1].users,1)
 for(const name of TYPE_TO_RAWS.chip){const result=computeFunnel([{...users[0],events:[{type:'login',t:1},{type:internalType(name),t:2}]}],{steps:['login','chip'],startAt:0,endAt:10,asOf:10});assert.equal(result.total_converted,1)}
})
