const {Worker}=require('node:worker_threads'),path=require('node:path')
let running=null,timer=null,lastResult=null,lastError=null
function refresh(){
 if(running)return running
 running=new Promise(resolve=>{
  const worker=new Worker(path.join(__dirname,'worker.js'),{env:{...process.env,PG_POOL_MAX:'1'},resourceLimits:{maxOldGenerationSizeMb:512}})
  let settled=false
  const timeout=setTimeout(()=>finish({error:'路径派生库刷新超时，保留上个版本'}),120000)
  function finish(message){if(settled)return;settled=true;clearTimeout(timeout);lastError=message.error||null;if(message.result)lastResult=message.result;if(lastError)console.warn('[path-index]',lastError);worker.terminate().finally(()=>{running=null;resolve(message)})}
  worker.once('message',finish);worker.once('error',e=>finish({error:e.message}));worker.once('exit',code=>{if(!settled)finish({error:'路径派生库刷新退出：'+code})})
 })
 return running
}
function start(){if(process.env.ENABLE_PATH_INDEX!=='true'||process.env.ANALYTICS_STORAGE!=='hologres'||timer)return;refresh();timer=setInterval(refresh,60000);timer.unref()}
function stop(){if(timer)clearInterval(timer);timer=null}
function stats(){return {...require('./store').stats(),refreshing:!!running,last_result:lastResult,last_error:lastError}}
module.exports={start,stop,refresh,stats}
