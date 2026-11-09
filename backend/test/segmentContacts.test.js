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
