const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite')
const remote=require('../src/data/hologres'),{conversionUsers}=require('../src/data/conversionFacts'),{loginConversion}=require('../src/analytics/loginConversion')
test('login SQL reduces unrelated history while preserving reports, filters and actual earlier context',async()=>{
 const db=new DatabaseSync(':memory:'),query=remote.query,cte=remote.eventsCte
 db.exec('CREATE TABLE events(user_key TEXT,user_id TEXT,anonymous_id TEXT,event_id TEXT,event_name TEXT,client_ts INTEGER,session_id TEXT,device TEXT,app_version TEXT,page TEXT,properties TEXT);CREATE TABLE users(user_key TEXT,source TEXT)')
 db.function('jsonb_build_object',{varargs:true},(...args)=>{const out={};for(let i=0;i<args.length;i+=2)if(args[i+1]!=null)out[args[i]]=JSON.parse(args[i+1]);return JSON.stringify(out)})
 db.function('jsonb_strip_nulls',x=>x)
 const add=(id,name,t,p={})=>db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('user:'+id,String(id),'a'+id,id+':'+name+':'+t,name,t,'s'+id,'desktop','v1','/home',JSON.stringify(p))
 for(const [id,source]of [[1,'x'],[2,'x'],[3,'y']])db.prepare('INSERT INTO users VALUES(?,?)').run('user:'+id,source)
 add(1,'login_attempt_started',1000,{login_method:'google',login_attempt_id:'old'})
 add(1,'page_viewed',2000)
 add(1,'login_attempt_started',6000,{login_method:'wallet',login_attempt_id:'current'})
 add(1,'login_attempt_finished',7000,{login_method:'wallet',login_attempt_id:'current',outcome:'success'})
 add(1,'login_succeeded',7001,{login_type:'manual'})
 add(2,'page_viewed',2000);add(2,'page_viewed',6000)
 add(3,'login_attempt_finished',6000,{login_attempt_id:'orphan',outcome:'failed'})
 for(let i=0;i<500;i++)add(1,'chip_analysis_viewed',7100+i)
 remote.eventsCte=()=> 'WITH e AS (SELECT * FROM events), facts AS (SELECT * FROM users)'
 remote.query=async(sql,params)=>{
  const translated=sql.replace(/=ANY\(\$(\d+)(?:::text\[\])?\)/g,(_,n)=>` IN (SELECT value FROM json_each($${n}))`).replace(/::text\[\]|::text/g,'')
  const used=new Set(translated.match(/\$\d+/g)),bindings=Object.fromEntries(params.map((v,i)=>['$'+(i+1),Array.isArray(v)?JSON.stringify(v):v??null]).filter(([key])=>used.has(key)))
  return db.prepare(translated).all(bindings).map(r=>({...r,properties:JSON.parse(r.properties)}))
 }
 try{
  const s={snapshot_cutoff:new Date(20000).toISOString(),as_of:new Date(20000).toISOString()}
  for(const audience of [null,[],['user:1'],['user:2']])for(const source of ['all','x','y']){
   const b={start:5000,end:10000,source},full=await conversionUsers(s,b,audience),scoped=await conversionUsers(s,b,audience,{scene:'login'})
   for(const method of ['all','wallet','google'])for(const status of ['all','success'])assert.deepEqual(loginConversion(scoped,{...b,method,status},s),loginConversion(full,{...b,method,status},s))
   if(audience===null&&source==='all'){
    assert(scoped.reduce((n,u)=>n+u.events.length,0)<full.reduce((n,u)=>n+u.events.length,0)/10)
    assert(scoped.find(u=>u.id==='user:1').events.some(e=>e.raw_name==='page_viewed'&&e.t===2000))
    assert.deepEqual(scoped.find(u=>u.id==='user:2').events.map(e=>e.t),[2000])
   }
  }
 }finally{remote.query=query;remote.eventsCte=cte;db.close()}
})
