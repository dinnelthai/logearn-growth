/** Bounded per-process L1 with optional opt-in immutable snapshot Redis L2.
 * L2 never accepts raw live status, user data, or paid model responses. */
const {immutable,getSharedStore}=require('./snapshotShared');
const MAX_KEYS=256, MAX_BYTES=64*1024*1024,MAX_VALUE_BYTES=4*1024*1024;
function createCache({shared=null,clock=Date.now}={}){
 const entries=new Map(),pending=new Map();
 let bytes=0,generation=0;
 const stats={hits:0,misses:0,sets:0,l2Hits:0,l2Misses:0,l2Errors:0};
 function remove(key){const v=entries.get(key);if(v){bytes-=v.size;entries.delete(key)}}
 function read(key){
  const entry=entries.get(key);
  if(!entry)return undefined;
  if(entry.expires<=clock()){remove(key);return undefined}
  return entry.value;
 }
 function storeLocal(key,value,ttl){
  remove(key);
  let size;
  try{size=Buffer.byteLength(JSON.stringify(value))}catch{return false}
  if(size>MAX_VALUE_BYTES||!(ttl>0))return false;
  for(const [k,v]of entries)if(v.expires<=clock())remove(k);
  while(entries.size&&(entries.size>=MAX_KEYS||bytes+size>MAX_BYTES))
   remove(entries.keys().next().value);
  entries.set(key,{value,size,expires:clock()+ttl*1000});bytes+=size;
  return true;
 }
 async function get(key){
  const found=read(key);
  if(found!==undefined){stats.hits++;return {value:found,source:'L1'}}
  stats.misses++;
  if(shared&&immutable(key)){
   try{
    const hit=await shared.get(key);
    if(hit&&hit.expiresAt>clock()){
     const remaining=(hit.expiresAt-clock())/1000;
     if(remaining>0){storeLocal(key,hit.value,remaining);stats.l2Hits++;return {value:hit.value,source:'L2'}}
    }
    stats.l2Misses++;
   }catch{stats.l2Errors++}
  }
  return null;
 }
 async function set(key,value,ttl=30){
  stats.sets++;
  if(!storeLocal(key,value,ttl))return;
  if(shared&&immutable(key)){
   try{await shared.set(key,value,ttl)}catch{stats.l2Errors++}
  }
 }
 async function del(key){
  remove(key);pending.delete(key);
  if(shared&&immutable(key))try{await shared.del(key)}catch{stats.l2Errors++}
 }
 async function cached(key,fn,{ttl=30}={}){
  const found=await get(key);
  if(found)return found.value;
  if(pending.has(key))return pending.get(key);
  const epoch=generation;
  const promise=Promise.resolve().then(fn).then(async value=>{
   if(epoch===generation&&pending.get(key)===promise)await set(key,value,ttl);
   return value;
  }).finally(()=>{if(pending.get(key)===promise)pending.delete(key)});
  pending.set(key,promise);
  return promise;
 }
 function getStats(){
  return {l1:{keys:entries.size,hits:stats.hits,misses:stats.misses,
   hitRate:stats.hits/(stats.hits+stats.misses)||0,vsize:bytes,ksize:0},
   l2:{hits:stats.l2Hits,misses:stats.l2Misses,errors:stats.l2Errors,
    hitRate:stats.l2Hits/(stats.l2Hits+stats.l2Misses)||0},
   total:{sets:stats.sets,pendingRequests:pending.size}};
 }
 function resetStats(){for(const k of Object.keys(stats))stats[k]=0}
 function flush(){generation++;entries.clear();pending.clear();bytes=0}
 return {get,set,del,cached,getStats,resetStats,flush,l1:{get:read}};
}
const current=createCache({shared:getSharedStore()});
module.exports={...current,createCache};
