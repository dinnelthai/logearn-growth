// Read-only synthetic SQL benchmark on the configured Hologres instance.
// Generates 1M rows inside each query; creates no tables and touches no live events.
require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true})
const assert=require('node:assert/strict'),fs=require('node:fs')
const remote=require('../src/data/hologres')
const {orderedFunnelUsers,retentionUsers,features}=require('../src/data/remoteUsers')
const {computeFunnel}=require('../src/analytics/funnel')
const start=Date.parse('2026-09-01T00:00:00+07:00'),asOf=start+100*3600000
const s={snapshot_cutoff:new Date(asOf).toISOString(),as_of:new Date(asOf).toISOString()}
const body={start,end:asOf+1,steps:['logged_in_visit','token','chip'],hours:24,source:'all',strategy:'all'}
remote.eventsCte=()=>`WITH generated AS(SELECT i,MOD(i-1,10000) AS uid,FLOOR((i-1)/10000.0)::bigint AS seq FROM generate_series(1,1000000) g(i)),
 e AS(SELECT i::text AS event_id,'direct'::text AS first_entry_source,'user:u'||uid AS user_key,'u'||uid AS user_id,
 CASE MOD(seq,6) WHEN 0 THEN 'login_succeeded' WHEN 1 THEN 'token_detail_viewed' WHEN 2 THEN 'chip_analysis_drilldown'
 WHEN 3 THEN 'strategy_started' WHEN 4 THEN 'chip_analysis_viewed' ELSE 'token_detail_viewed' END AS event_name,
 ${start}+seq*3600000 AS client_ts,
 TO_CHAR(TO_TIMESTAMP((${start}+seq*3600000)/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS date,
 '{"strategy_type":"signal"}'::jsonb AS properties FROM generated WHERE $1::timestamptz IS NOT NULL),
 facts AS(SELECT user_key,'direct'::text AS source,MIN(client_ts) FILTER(WHERE event_name IN('chip_analysis_viewed','chip_analysis_drilldown')) AS first_chip FROM e GROUP BY user_key)`
async function main(){const results=[]
 try{
  const scenarios={
    north:async()=>{const r=await remote.query(`${remote.eventsCte()} SELECT COUNT(DISTINCT user_key) AS n FROM e
      WHERE event_name IN ('chip_analysis_viewed','chip_analysis_drilldown')`,[s.snapshot_cutoff]);assert.equal(Number(r[0].n),10000);return r},
    funnel:async()=>{const users=await orderedFunnelUsers(s,body);const r=computeFunnel(users,{steps:body.steps,startAt:start,endAt:body.end,asOf});assert.deepEqual(r.steps.map(x=>x.users),[10000,10000,10000]);return users},
    retention:async()=>{const users=await retentionUsers(s,{start,end:body.end});assert.equal(users.length,10000);return users},
    segments:async()=>{const rows=await features(s);assert.equal(rows.length,10000);return rows},
  }
  for(const [name,fn]of Object.entries(scenarios)){const before=Date.now();try{const value=await fn();results.push({name,passed:true,ms:Date.now()-before,returned_rows:value.length,returned_bytes:Buffer.byteLength(JSON.stringify(value))})}catch(e){results.push({name,passed:false,ms:Date.now()-before,error:e.message})}console.log(results.at(-1))}
  if(process.env.BENCH_CONCURRENCY==='2'){
    const before=Date.now()
    try{const values=await Promise.all([scenarios.funnel(),scenarios.funnel()]);results.push({name:'funnel_concurrency_2',passed:true,ms:Date.now()-before,returned_rows:values.reduce((n,v)=>n+v.length,0)})}
    catch(e){results.push({name:'funnel_concurrency_2',passed:false,ms:Date.now()-before,error:e.message})}
    console.log(results.at(-1))
  }
  fs.writeFileSync(require('node:path').join(__dirname,'../docs/million-query-results.json'),JSON.stringify({fixture:'1M generated rows / 10k authenticated users / 100 events each',scope:'synthetic SQL; optional two simultaneous funnel queries; not production physical-table or 10-user load test',checked_at:new Date().toISOString(),results},null,2)+'\n')
 }finally{await remote.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
