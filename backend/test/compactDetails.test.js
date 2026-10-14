const {test}=require('node:test'),assert=require('node:assert/strict'),{compactDetails,expandDetails}=require('../src/analytics/compactDetails')
test('cached profile compaction preserves false zero unknown and keeps API fields named',()=>{const r={details:{'user:1':{balance:null,points:0,verified:false,name:'x'},'user:2':{name:'y'}},payload:{total:2}},c=compactDetails(r);assert.deepEqual(expandDetails(c,'user:1'),r.details['user:1']);assert.equal(expandDetails(c,'user:2').balance,null);assert.equal(c.payload,r.payload);assert.deepEqual(expandDetails(r,'user:1'),r.details['user:1'])})
test('shared operational tags round-trip through a single compact dictionary',()=>{
 const tags=[{id:'kol:k',name:'KOL',type:'kol'},{id:'activity:a',name:'活动',type:'activity'}]
 const r={details:{'user:1':{operational_tags:tags},'user:2':{operational_tags:[tags[0]]},'user:3':{operational_tags:[]}}},c=compactDetails(r)
 assert.equal(c.operational_tag_dictionary.length,2)
 for(const id of Object.keys(r.details))assert.deepEqual(expandDetails(c,id),r.details[id])
 assert.deepEqual(expandDetails(JSON.parse(JSON.stringify(c)),'user:1'),r.details['user:1'])
})
