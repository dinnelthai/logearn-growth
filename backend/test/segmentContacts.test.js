const {test}=require('node:test')
const assert=require('node:assert/strict')
const {segmentContacts}=require('../src/data/segmentContacts')
test('loads verified contacts only for the current page and preserves multiple identifiers',async()=>{
 let args
 const query=async(sql,params)=>{args={sql,params};return [{account_id:'1',provider:'telegram',subject:'12345'},{account_id:'1',provider:'email',subject:'a@example.com'},{account_id:'1',provider:'email',subject:'b@example.com'}]}
 const rows=await segmentContacts(query,[{id:'user:1'},{id:'user:2'}],'2026-01-01')
 assert.match(args.sql,/verified\s*=\s*true/i)
 assert.deepEqual(args.params,[['1','2'],'2026-01-01'])
 assert.deepEqual(rows[0].contacts,{telegram:['12345'],email:['a@example.com','b@example.com']})
 assert.deepEqual(rows[1].contacts,{telegram:[],email:[]})
})
test('contact filters apply to the complete cached list',()=>{
 const {filterContactIds}=require('../src/data/segmentContacts')
 const value={details:{'user:1':{telegram_bound:true,email_bound:false},'user:2':{telegram_bound:false,email_bound:true},'user:3':{telegram_bound:true,email_bound:true},'user:4':{telegram_bound:false,email_bound:false}}}
 const ids=Object.keys(value.details)
 assert.deepEqual(filterContactIds(value,ids,'telegram'),['user:1','user:3'])
 assert.deepEqual(filterContactIds(value,ids,'both'),['user:3'])
 assert.deepEqual(filterContactIds(value,ids,'either'),['user:1','user:2','user:3'])
 assert.deepEqual(filterContactIds(value,ids,'neither'),['user:4'])
 assert.throws(()=>filterContactIds(value,ids,'invalid'))
})
test('credits balance filters apply to all cached users and distinguish unknown from zero',()=>{
 const {filterCreditsIds}=require('../src/data/segmentContacts')
 const value={details:{a:{credits_available:0},b:{credits_available:100},c:{credits_available:200},d:{credits_available:null}}},ids=Object.keys(value.details)
 assert.deepEqual(filterCreditsIds(value,ids,{min:100,max:200}),['b','c'])
 assert.deepEqual(filterCreditsIds(value,ids,{min:0,max:0}),['a'])
 assert.deepEqual(filterCreditsIds(value,ids,{unknown:true}),['d'])
 assert.throws(()=>filterCreditsIds(value,ids,{min:200,max:100}))
})
test('value signal filter uses the same evidence as the value tag',()=>{
 const {filterValueSignalIds}=require('../src/data/segmentContacts')
 const value={details:{a:{trade_count:1},b:{nft_count:1},c:{has_balance:true},d:{vip_active:true},e:{credits_available:1},f:{trade_count:0}}},ids=Object.keys(value.details)
 for(const [signal,id] of [['trade','a'],['nft','b'],['balance','c'],['vip','d'],['credits','e']]) assert.deepEqual(filterValueSignalIds(value,ids,signal),[id])
 assert.throws(()=>filterValueSignalIds(value,ids,'invalid'))
})
test('value and credits filters are combined when materializing an audience',()=>{
 const {cachedAudience}=require('../src/analytics/taskAudience')
 const value={lists:{'behavior:unactivated':['user:1','user:2','user:3']},details:{'user:1':{trade_count:1,credits_available:200},'user:2':{trade_count:1,credits_available:50},'user:3':{trade_count:0,credits_available:200}}}
 assert.deepEqual(cachedAudience(value,'behavior:unactivated','',null,{min:100},'trade'),['user:1'])
})
