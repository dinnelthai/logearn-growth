#!/usr/bin/env node
'use strict';
// Read-only Hologres query plan capture. No DDL, DML or live model calls.
// Set explicit approval and expected DB before connecting.
const fs=require('node:fs'),path=require('node:path'),{Pool}=require('pg');
const {statusQueries}=require('../src/data/hologres');
const {weeklyCoreQuery}=require('../src/data/weeklyCore');
const {weeklyCoreWindow}=require('../src/analytics/weeklyCore');
function workload({cutoff,dayEnd,source='all'}){
 const status=statusQueries(),w=weeklyCoreWindow(Date.parse(cutoff),dayEnd);
 return Object.entries(status).map(([name,sql])=>({name:'status-'+name,sql,args:[cutoff]}))
  .concat([{name:'weekly-core',sql:weeklyCoreQuery(),args:[cutoff,w.start,w.end,w.previous_start,source]}]);
}
function extract(plan,name,analyze){
 const document=Array.isArray(plan)?plan[0]:plan;
 const node=document?.Plan||{};
 return {query:name,analyze,estimatedTotalCost:node['Total Cost']??null,
  estimatedRows:node['Plan Rows']??null,
  actualTotalTimeMs:node['Actual Total Time']??null,
  actualRows:node['Actual Rows']??null,
  executionTimeMs:document['Execution Time']??null,
  planningTimeMs:document['Planning Time']??null,
  planNodeTypes:(function flatten(item,types=[]){
   if(item['Node Type'])types.push(item['Node Type']);
   for(const child of item.Plans||[])flatten(child,types);
   return types;
  })(node)};
}
async function main({env=process.env,argv=process.argv.slice(2)}={}){
 if(env.HOLOGRES_EXPLAIN_APPROVED!=='1')throw Error('Explicit HOLOGRES_EXPLAIN_APPROVED=1 required');
 const expected=env.HOLOGRES_EXPLAIN_EXPECTED_DB;
 if(!expected||!/^[A-Za-z0-9_-]{1,80}$/.test(expected))
  throw Error('Provide an exact HOLOGRES_EXPLAIN_EXPECTED_DB');
 const analyze=argv.includes('--analyze');
 if(analyze&&env.HOLOGRES_EXPLAIN_ANALYZE_APPROVED!=='1')
  throw Error('ANALYZE executes heavy read queries; separate approval required');
 const cutoff=env.HOLOGRES_EXPLAIN_CUTOFF||new Date().toISOString();
 const dayEnd=Number(env.HOLOGRES_EXPLAIN_DAY_END||Math.floor(Date.parse(cutoff)/86400000)*86400000-7*3600000);
 if(!Number.isSafeInteger(Date.parse(cutoff))||!Number.isSafeInteger(dayEnd))
  throw Error('Invalid window');
 const pool=new Pool(env.DATABASE_URL?{connectionString:env.DATABASE_URL,max:1}:
  {host:env.PGHOST,port:Number(env.PGPORT||5432),database:env.PGDATABASE,
   user:env.PGUSER,password:env.PGPASSWORD,max:1});
 const results=[];
 try{
  const client=await pool.connect();
  try{
   const db=(await client.query('SELECT current_database() AS database_name')).rows[0]?.database_name;
   if(db!==expected)throw Error('Database identity mismatch; no workload sent');
   for(const item of workload({cutoff,dayEnd})){
    await client.query('BEGIN READ ONLY');
    try{
     await client.query('SET LOCAL statement_timeout=10000');
     const opts=analyze?'ANALYZE TRUE, BUFFERS TRUE, FORMAT JSON':'FORMAT JSON';
     const response=await client.query('EXPLAIN ('+opts+') '+item.sql,item.args);
     results.push(extract(response.rows[0]['QUERY PLAN'],item.name,analyze));
    }catch(error){
     results.push({query:item.name,error:String(error.code||error.message).slice(0,160)});
    }finally{await client.query('ROLLBACK')}
   }
  }finally{client.release()}
 }finally{await pool.end()}
 const output={observedAt:new Date().toISOString(),database:expected,
  analyze,source:'EXPLAIN read-only',caution:'Query plans are not performance gains; compare old and combined with real event volumes',
  results};
 const destination=argv.find(x=>x.startsWith('--output='))?.slice(9);
 if(destination)fs.writeFileSync(path.resolve(destination),JSON.stringify(output,null,2)+'\n');
 else process.stdout.write(JSON.stringify(output,null,2)+'\n');
 return output;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={workload,extract,main};
