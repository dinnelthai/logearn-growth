'use strict';
// Optional L2 for immutable, unscoped Hologres snapshot facts ONLY. No live
// status, per-owner data or LLM content is ever stored in this namespace.
const {createHash}=require('node:crypto');
const MAX_BYTES=4*1024*1024;
function immutable(key){
 if(typeof key!=='string'||key.length>500)return false;
 if(/^snapshot:[A-Za-z0-9_-]{6,128}$/.test(key))return true;
 if(!key.startsWith('["weekly-core-payload-v1",')&&
    !key.startsWith('["business-north-v3",'))return false;
 try{
  const p=JSON.parse(key);
  const id=typeof p[1]==='string'&&p[1].length>=6&&p[1].length<=128;
  if(p[0]==='weekly-core-payload-v1')return p.length===4&&id&&
   Number.isSafeInteger(p[2])&&p[2]>0&&
   typeof p[3]==='string'&&p[3].length>0&&p[3].length<=200;
  // Business north star results are aggregated and pinned to one exact
  // source snapshot, period and channel. Never accept arbitrary owner keys.
  return p[0]==='business-north-v3'&&p.length===5&&id&&
   Number.isSafeInteger(p[2])&&p[2]>=0&&Number.isSafeInteger(p[3])&&
   p[3]>p[2]&&(p[4]===null||(typeof p[4]==='string'&&
   p[4].length>0&&p[4].length<=200));
 }catch{return false}
}
function createSharedStore({client,namespace,clock=Date.now}={}){
 if(!client||typeof client.get!=='function'||typeof client.set!=='function'||typeof client.del!=='function'||
  typeof namespace!=='string'||! /^[A-Za-z0-9_-]{3,80}$/.test(namespace))
  throw Error('共享快照缓存必须使用显式环境命名空间');
 const redisKey=key=>'logearn:growth:immutable:v1:'+namespace+':'+createHash('sha256').update(key).digest('hex');
 return {
  async get(key){
   if(!immutable(key))return null;
   const payload=await client.get(redisKey(key));
   if(!payload||Buffer.byteLength(payload,'utf8')>MAX_BYTES+200)return null;
   let row;try{row=JSON.parse(payload)}catch{return null}
   return row?.v===1&&Number.isSafeInteger(row.expiresAt)&&
    row.expiresAt>clock()&&Object.hasOwn(row,'value')?{value:row.value,expiresAt:row.expiresAt}:null;
  },
  async set(key,value,ttl){
   if(!immutable(key)||!Number.isFinite(ttl)||ttl<=0||ttl>900)return false;
   // Only aggregate counts; raw weekly-core user_key lists stay in process L1.
   if(key.startsWith('["weekly-core-payload-v1",')&&
     (value==null||typeof value!=='object'||Array.isArray(value)||
      Object.hasOwn(value,'members')||Object.hasOwn(value,'lists')||
      value.available!==true||!Number.isFinite(value.users)))return false;
   const expiresAt=clock()+Math.floor(ttl*1000),row=JSON.stringify({v:1,expiresAt,value});
   if(Buffer.byteLength(row,'utf8')>MAX_BYTES)return false;
   await client.set(redisKey(key),row,'EX',Math.ceil(ttl));
   return true;
  },
  async del(key){if(immutable(key))await client.del(redisKey(key))}
 };
}
function getSharedStore(env=process.env){
 if(!env.GROWTH_SHARED_CACHE_URL)return null;
 if(!/^[A-Za-z0-9_-]{3,80}$/.test(env.GROWTH_SHARED_CACHE_NAMESPACE||'')){
  console.error('[growth cache] Redis L2 disabled: set GROWTH_SHARED_CACHE_NAMESPACE');
  return null;
 }
 try{
  const Redis=require('ioredis');
  const client=new Redis(env.GROWTH_SHARED_CACHE_URL,{lazyConnect:true,
   enableOfflineQueue:false,maxRetriesPerRequest:1,connectTimeout:800,
   retryStrategy:()=>null});
  client.on('error',()=>{});
  let connecting=null;
  const connected={
   async get(key){await ready();return client.get(key)},
   async set(...args){await ready();return client.set(...args)},
   async del(key){await ready();return client.del(key)}
  };
  async function ready(){
   if(client.status==='ready')return;
   connecting ||=client.connect().finally(()=>{connecting=null});
   await connecting;
  }
  return createSharedStore({client:connected,namespace:env.GROWTH_SHARED_CACHE_NAMESPACE});
 }catch(error){
  console.error('[growth cache] Redis L2 disabled:',error.message);
  return null;
 }
}
module.exports={immutable,createSharedStore,getSharedStore};
