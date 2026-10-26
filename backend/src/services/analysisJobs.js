const {Worker}=require('node:worker_threads')
const {randomBytes,createHash}=require('node:crypto')
const path=require('node:path')
const remote=require('../data/hologres')
const jobs=new Map(),keys=new Map(),queue=[]
let active=0
function sweep(){const now=Date.now();for(const [id,j] of jobs)if(j.expires<now&&!['running','queued'].includes(j.state)){jobs.delete(id);keys.delete(j.key);remote.deleteCached('job:'+id)}}
function start(kind,body,snapshot,audience,owner){
  sweep()
  const key=createHash('sha1').update(JSON.stringify({kind,body,version:snapshot.snapshot_id,audience,owner})).digest('hex')
  const existing=keys.get(key)
  if(existing&&jobs.has(existing)){
    const previous=jobs.get(existing)
    if(['queued','running'].includes(previous.state)||(previous.state==='complete'&&remote.getCached('job:'+existing)!==null))return previous
    jobs.delete(existing);keys.delete(key);remote.deleteCached('job:'+existing)
  }
  if(jobs.size>=128){
    for(const [oldId,old]of jobs){if(!['running','queued'].includes(old.state)){jobs.delete(oldId);keys.delete(old.key);remote.deleteCached('job:'+oldId);break}}
  }
  if(queue.length>=20||jobs.size>=128)throw Object.assign(new Error('分析队列已满，请稍后重试'),{status:429})
  const id=randomBytes(16).toString('hex'),j={id,key,owner,state:'queued',expires:Date.now()+900000,snapshot:snapshot.snapshot_id,context:{mode:kind,start:body.start,end:body.end,source:body.source||'all',...(kind==='paths'&&body.details===false?{path_options:{details:false,path_direction:body.path_direction||'after',path_start:body.path_start||'all',path_stop:body.path_stop||'none',path_depth:Number(body.path_depth)||5},audience_snapshot:audience==null?null:[...audience]}:{}),...(kind==='segments'?{cohort_id:body.resolving_cohort_id||null,cohort_rule:body.resolving_cohort_rule||null,selection:{pool:body.pool||'business',filters:body.filters||{},tag_mode:body.tag_mode||'any',tags:(body.user_tag_snapshot||[]).map(t=>({id:t.id,name:t.name})),scoped_count:audience?.length??null}}:{})}}
  jobs.set(id,j);keys.set(key,id);queue.push({j,data:{kind,body,snapshot,audience,owner}});pump();return j
}
function pump(){
  while(active<2&&queue.length){
    const {j,data}=queue.shift();active++;j.state='running'
    const worker=new Worker(path.join(__dirname,'../workers/remoteAnalysis.js'),{workerData:data,
      env:{...process.env,PG_POOL_MAX:'1'},resourceLimits:{maxOldGenerationSizeMb:256}})
    let settled=false
    const timer=setTimeout(()=>finish(new Error('分析超时，请缩小范围')),30000)
    async function finish(err,result){
      if(settled)return;settled=true;clearTimeout(timer)
      try{
        if(err){j.state='failed';j.error=err.message;j.status=err.status||503}
        else{
          const size=Buffer.byteLength(JSON.stringify(result))
          if(size>4*1024*1024)throw Object.assign(new Error('分析结果超出缓存预算，请缩小范围'),{status:422})
          await remote.cached('job:'+j.id,async()=>result,900000)
          j.state='complete'
        }
      }catch(e){j.state='failed';j.error=e.message;j.status=e.status||503}
      finally{await worker.terminate();active--;pump()}
    }
    worker.once('message',m=>m.error?finish(Object.assign(new Error(m.error),{status:m.status})):finish(null,m.result))
    worker.once('error',finish)
    worker.once('exit',code=>{if(!settled)finish(new Error('分析进程退出：'+code))})
  }
}
function get(id,owner){sweep();const j=jobs.get(id);if(!j||j.owner!==owner)throw Object.assign(new Error('分析结果不存在或已过期，请重新运行'),{status:409});return j}
function result(id,owner){const j=get(id,owner),value=remote.getCached('job:'+id)
  if(!value)throw Object.assign(new Error('分析结果已过期，请重新运行'),{status:409})
  return {j,value}
}
module.exports={start,get,result}
