// The segments worker runs four points/check-in queries in parallel.
// Giving it one pg client with a 3-second connection acquisition timeout
// makes healthy long-running scans exhaust their queued acquire timeout.
function analysisWorkerEnv(env){
 const requested=Number(env.PG_ANALYSIS_WORKER_POOL_MAX)
 const max=Number.isSafeInteger(requested)&&requested>=4?Math.min(requested,8):4
 const requestedTimeout=Number(env.PG_CONNECT_TIMEOUT_MS)
 const timeout=Number.isFinite(requestedTimeout)&&requestedTimeout>0?Math.max(10000,requestedTimeout):10000
 return {...env,PG_POOL_MAX:String(max),PG_CONNECT_TIMEOUT_MS:String(timeout)}
}
module.exports={analysisWorkerEnv}
