'use strict';
// AI tables must never silently use the analytics/business write pool.
const {Pool}=require('pg');

function unavailable(reason){
 const failure=()=>Promise.reject(Object.assign(new Error(reason),{
  status:503,code:'AI_DATABASE_NOT_READY'
 }));
 // Preserve the subset of the pg Pool interface used by AI routes/workers;
 // keep unrelated HTTP endpoints available when AI storage is unconfigured.
 return {query:failure,connect:failure,end:async()=>{},on(){return this}};
}

function buildPool(env=process.env,PoolType=Pool){
 const value=env.AI_DATABASE_URL;
 if(!value)return unavailable('AI_DATABASE_URL 未配置；禁止回退到业务 PostgreSQL');
 let target;
 try{target=new URL(value)}catch{return unavailable('AI_DATABASE_URL 格式无效')}
 if(!['postgres:','postgresql:'].includes(target.protocol)||!target.hostname||!target.pathname||target.pathname==='/')
  return unavailable('AI_DATABASE_URL 必须指定独立 PostgreSQL 数据库');
 // Protect against the most common error: explicitly pointing AI at the
 // same business host, port and database. Aliases/proxies still need review.
 if(env.PGHOST&&env.PGDATABASE&&
    target.hostname.toLowerCase()===String(env.PGHOST).toLowerCase()&&
    Number(target.port||5432)===Number(env.PGPORT||5432)&&
    decodeURIComponent(target.pathname.slice(1))===env.PGDATABASE)
  return unavailable('AI_DATABASE_URL 与业务 PostgreSQL 数据库相同，拒绝连接');
 const pool=new PoolType({connectionString:value,max:5,connectionTimeoutMillis:5000,statement_timeout:30000});
 pool.on('error',error=>console.error('[AI database]',error.message));
 return pool;
}
module.exports=buildPool();
