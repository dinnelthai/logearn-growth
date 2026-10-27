const {configured}=require('./twitterApi')
const fail=message=>Object.assign(Error(message),{status:502})
function cleanPost(p){
  if(!p||!/^\d{1,30}$/.test(String(p.id||''))||typeof p.text!=='string'||!Number.isFinite(Date.parse(p.createdAt)))throw fail('账号内容字段不完整')
  const number=value=>Number.isFinite(value)&&value>=0?value:null
  return {id:String(p.id),text:p.text.slice(0,30000),createdAt:p.createdAt,lang:String(p.lang||''),likeCount:number(p.likeCount),replyCount:number(p.replyCount),viewCount:number(p.viewCount),retweetCount:number(p.retweetCount),isReply:!!p.isReply,retweeted_tweet:p.retweeted_tweet?{id:String(p.retweeted_tweet.id||'')}:null,mentions:(p.mentions||p.entities?.user_mentions||p.entities?.userMentions||[]).slice(0,50).map(m=>String(m.screen_name||m.userName||'')).filter(name=>/^[a-zA-Z0-9_]{1,15}$/.test(name))}
}
function cleanProfile(p){
  if(!p||p.unavailable||!/^\d{1,30}$/.test(String(p.id||''))||!/^\w{1,15}$/.test(p.userName||''))throw fail('账号不存在、不可用或资料不完整')
  return {id:String(p.id),userName:p.userName,name:String(p.name||p.userName).slice(0,200),description:String(p.description||p.profile_bio?.description||'').slice(0,4000),followers:Number.isSafeInteger(p.followers)&&p.followers>=0?p.followers:null,following:Number.isSafeInteger(p.following)&&p.following>=0?p.following:null,createdAt:Number.isFinite(Date.parse(p.createdAt))?p.createdAt:null}
}
async function read(endpoint,params,hooks,kind){
  if(!configured())throw Object.assign(Error('账号数据源尚未配置'),{status:503})
  for(let attempt=0;attempt<2;attempt++){
    const reservation=hooks.reserve(kind==='profile'?18:600)
    try{
      const url=new URL('https://api.twitterapi.io'+endpoint);url.search=new URLSearchParams(params).toString()
      const response=await fetch(url,{headers:{'X-API-Key':process.env.TWITTERAPI_IO_API_KEY.trim()},signal:AbortSignal.timeout(20000)})
      if(!response.ok){const message={401:'账号数据源密钥无效',402:'账号数据源余额不足',403:'账号数据源拒绝访问',429:'账号数据源限流'}[response.status]||'账号数据源暂不可用';throw Object.assign(fail(message),{retryable:[429,500,502,503,504].includes(response.status)})}
      const body=await response.json()
      if(body.status!=='success'||!body.data)throw fail('账号数据源返回异常或账号不可用')
      if(kind==='profile'){
        const value=cleanProfile(body.data);hooks.settle(reservation,18);return value
      }
      if(!Array.isArray(body.data.tweets)||body.data.tweets.length>20||typeof body.has_next_page!=='boolean'||body.has_next_page&&(typeof body.next_cursor!=='string'||!body.next_cursor))throw fail('账号内容分页响应异常')
      const posts=body.data.tweets.map(cleanPost)
      const pin=body.data.pin_tweet?cleanPost(body.data.pin_tweet):null
      hooks.settle(reservation,Math.max(15,(posts.length+(pin?1:0))*15))
      return {posts,pin,has_next_page:body.has_next_page,next_cursor:body.next_cursor||''}
    }catch(error){
      if(attempt===1||!error.retryable&&error.name!=='TimeoutError'&&!(error instanceof TypeError))throw error.status?error:fail('账号数据请求失败，请稍后重试')
      await new Promise(resolve=>setTimeout(resolve,1000))
    }
  }
}
const profile=(name,hooks)=>read('/twitter/user/info',{userName:name},hooks,'profile')
const timeline=(id,cursor,hooks)=>read('/twitter/user/last_tweets',{userId:id,cursor,includeReplies:'false'},hooks,'timeline')
module.exports={profile,timeline,cleanPost,cleanProfile}
