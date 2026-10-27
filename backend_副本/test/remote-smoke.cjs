// Explicit integration check: requires a running remote-mode backend and credentials.
// Usage: SMOKE_EMAIL=... SMOKE_PASSWORD=... node test/remote-smoke.cjs
const assert=require('node:assert/strict')
const base=process.env.SMOKE_BASE_URL||'http://localhost:3001'
async function main(){
  if(!process.env.SMOKE_PASSWORD)throw Error('Set SMOKE_PASSWORD')
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:process.env.SMOKE_EMAIL||'admin@logearn.com',password:process.env.SMOKE_PASSWORD})})
  const auth=await login.json();assert(auth.token,'Login failed')
  const headers={Authorization:'Bearer '+auth.token,'Content-Type':'application/json'}
  const timings={}
  async function request(path,body){
    const deadline=Date.now()+45000;let next=path,options=body?{method:'POST',body:JSON.stringify(body)}:{}
    for(;;){const response=await fetch(base+next,{headers,...options}),value=await response.json()
      assert(response.ok,path+': '+JSON.stringify(value))
      if(response.status!==202)return value
      assert(Date.now()<deadline,'Job deadline exceeded');await new Promise(r=>setTimeout(r,250))
      next='/api/analytics/jobs/'+value.job_id;options={}}
  }
  try{
    const meta=await request('/api/analytics/meta');assert.equal(meta.storage,'hologres')
    const day=86400000,end=Math.floor((Date.parse(meta.as_of)+7*3600000)/day)*day-7*3600000+day,start=end-2*day
    let before=Date.now();const north=await request(`/api/metrics/north-star?start=${start}&end=${end}`);timings.north=Date.now()-before
    const nd=await request('/api/drill/users',{kind:'north_star_period',params:{start,end,snapshot_id:north.meta.snapshot_id},limit:2})
    assert.equal(nd.total,north.totals.active_users)
    for(const kind of ['funnel','retention','segments']){
      before=Date.now();const result=await request('/api/metrics/'+kind,{start,end,steps:['logged_in_visit','token','chip'],hours:24});timings[kind]=Date.now()-before
      let expected,key
      if(kind==='funnel'){expected=result.steps[0].users;key='reached:0';assert(result.steps.every((x,i)=>!i||x.users<=result.steps[i-1].users))}
      if(kind==='retention'){if(!result.daily.length)continue;expected=result.daily[0].cohort_size;key='cohort:'+result.daily[0].cohort_date}
      if(kind==='segments'){assert.equal(result.segments.reduce((n,r)=>n+r.users,0),result.total);const row=result.segments.find(r=>r.users);if(!row)continue;expected=row.users;key=row.segment}
      const drill=await request('/api/drill/users',{kind:'cached_list',params:{cache_id:result.drill.cache_id,list_key:key},limit:2})
      assert.equal(drill.total,expected);assert(drill.rows.length<=2)
      if(drill.rows.length){const timeline=await request('/api/drill/timeline?user_id='+encodeURIComponent(drill.rows[0].id)+'&cache_id='+result.drill.cache_id+'&limit=2');assert(timeline.events.length<=2)}
    }
    assert.equal((await fetch(base+'/api/metrics/north-star')).status,401)
    const invalid=await fetch(base+'/api/metrics/funnel',{method:'POST',headers,body:JSON.stringify({start,end,steps:['invented','chip']})});assert.equal(invalid.status,400)
    assert.equal((await fetch(base+'/api/metrics/trades',{headers})).status,501)
    console.log(JSON.stringify({passed:true,events:meta.event_count,timings_ms:timings}))
  }finally{await fetch(base+'/api/auth/logout',{method:'POST',headers})}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
