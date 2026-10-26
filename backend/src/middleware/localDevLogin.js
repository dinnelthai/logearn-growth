const DEV_TOKEN_PREFIX='dev-local-'
function enabled(){return process.env.LOCAL_DEV_LOGIN==='true'&&process.env.NODE_ENV!=='production'}
function allowed(req){
  if(!enabled()||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return false
  const local=hostname=>['localhost','127.0.0.1','[::1]'].includes(hostname)
  try{
    if(!local(new URL('http://'+req.headers.host).hostname))return false
    if(req.headers.origin&&!local(new URL(req.headers.origin).hostname))return false
  }catch{return false}
  return true
}
module.exports={enabled,allowed,DEV_TOKEN_PREFIX}
