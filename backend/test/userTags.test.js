process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),db=require('../src/db/connection'),fs=require('node:fs')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const {userTags,resolveTags}=require('../src/analytics/userTags'),{computeInsights}=require('../src/analytics/segmentInsights')
after(()=>db.close())
test('activities and KOL membership become deduplicated owner-scoped tags, including older records',()=>{
  const insert=db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  insert.run('k','a','Alice','X','1',1,1);insert.run('other','b','private','X','9',1,1)
  db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run('k','1');db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run('k','2')
  db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)').run('campaign','a','体验活动',1,2,'s','{}')
  for(const id of ['2','3'])db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run('campaign',id,null)
  const tags=userTags('a'),kol=tags.find(t=>t.id==='kol:k'),activity=tags.find(t=>t.id==='activity:campaign')
  assert.equal(tags.length,2);assert.deepEqual(kol.user_ids,['user:1','user:2']);assert.equal(activity.users,2)
  assert.deepEqual(resolveTags(tags,[kol.id,activity.id],'all'),['user:2'])
  assert.deepEqual(resolveTags(tags,[kol.id,activity.id],'any'),['user:1','user:2','user:3'])
  assert.deepEqual(resolveTags(tags,[kol.id],'any',[]),[])
  assert.deepEqual(resolveTags(tags,[kol.id],'any',['user:2','anonymous:x']),['user:2'])
  assert.throws(()=>resolveTags(tags,['kol:other']),/无权/)
  db.prepare('UPDATE crm_kols SET name=? WHERE id=?').run('Alice 新名称','k')
  assert.equal(userTags('a').find(t=>t.id==='kol:k').name,'Alice 新名称')
})
test('tag comparison supports overlapping users and independently drills each tag',()=>{
  const t1={id:'activity:a',name:'同名',type:'activity'},t2={id:'activity:b',name:'同名',type:'activity'}
  const rows=[{account_id:'1',user_key:'user:1',created_at:1,trade_count:0,analysis_days_period:1,operational_tags:[t1,t2]},{account_id:'2',user_key:'user:2',created_at:1,trade_count:0,analysis_days_period:0,operational_tags:[t1]}]
  const r=computeInsights(rows,{asOf:100,factsAsOf:100,start:0,end:100,pool:'registered',groupBy:'tag'})
  assert.equal(r.payload.total,2);assert.equal(r.payload.comparison.length,2)
  assert.deepEqual(r.payload.comparison.map(g=>g.users),[2,1])
  assert.deepEqual(r.lists[r.payload.comparison[1].list_key],['user:1'])
  assert.equal(r.details['user:1'].operational_tags.length,2)
})
test('large overlapping rosters do not block catalog or scoped analysis queries',()=>{
 const activity=db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)'),member=db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)')
 db.exec('BEGIN')
 try{for(let a=0;a<21;a++){const id='scale'+a;activity.run(id,'scale','活动'+a,1,2,'s','{}');for(let u=0;u<5000;u++)member.run(id,String(u),null)}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 const catalog=userTags('scale',{includeMembers:false});assert.equal(catalog.length,21);assert.equal(catalog[0].users,5000);assert.equal(catalog[0].user_ids,undefined)
 const scoped=userTags('scale',{userIds:['user:42']});assert.equal(scoped.length,21);assert.ok(scoped.every(t=>t.users===5000&&t.user_ids.length===1&&t.user_ids[0]==='user:42'))
 const selected=userTags('scale',{tagIds:['activity:scale0','activity:scale1']});assert.equal(resolveTags(selected,selected.map(t=>t.id)).length,5000)
 assert.deepEqual(userTags('scale',{tagIds:[]}),[]);assert.throws(()=>userTags('a',{tagIds:['activity:scale0']}),e=>e.status===404)
})
