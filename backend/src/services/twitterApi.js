const ENDPOINT='https://api.twitterapi.io/twitter/tweet/advanced_search'
function configured(){return Boolean(process.env.TWITTERAPI_IO_API_KEY?.trim())}
async function search({query,cursor='',beforeAttempt=()=>{},settleAttempt=()=>{},fetchImpl=fetch}) {
  if(!configured())throw Object.assign(Error('请在后端配置 TWITTERAPI_IO_API_KEY'),{status:503})
  for(let attempt=0;attempt<3;attempt++){
    const reservation=beforeAttempt()
    try{
      const url=new URL(ENDPOINT)
      url.search=new URLSearchParams({query,queryType:'Latest',cursor}).toString()
      const response=await fetchImpl(url,{headers:{'X-API-Key':process.env.TWITTERAPI_IO_API_KEY.trim()},signal:AbortSignal.timeout(20000)})
      if(!response.ok){
        const messages={400:'搜索条件被上游拒绝，请检查语法',401:'数据源密钥无效',402:'数据源余额不足，采集已停止',403:'数据源拒绝访问',429:'数据源限流，请稍后再试'}
        const error=Object.assign(Error(messages[response.status]||'数据源暂不可用'),{status:502,retryable:[429,500,502,503,504].includes(response.status)})
        throw error
      }
      const data=await response.json()
      // Never expose upstream messages: they can contain credentials or query content.
      if(data.status==='error'||data.error||!Array.isArray(data.tweets)||data.tweets.length>20||typeof data.has_next_page!=='boolean'||data.has_next_page&&(typeof data.next_cursor!=='string'||!data.next_cursor))throw Object.assign(Error('数据源响应异常，采集进度已保留'),{status:502})
      for(const post of data.tweets){
        if(!/^\d{1,30}$/.test(String(post.id||''))||!/^\d{1,30}$/.test(String(post.author?.id||''))||typeof post.text!=='string'||!Number.isFinite(Date.parse(post.createdAt)))throw Object.assign(Error('数据源推文字段不完整，采集进度已保留'),{status:502})
      }
      settleAttempt(reservation,Math.max(15,data.tweets.length*15))
      return data
    }catch(error){
      if(attempt===2||!error.retryable&&error.name!=='TimeoutError'&&!(error instanceof TypeError)){
        if(error.status)throw error
        throw Object.assign(Error('数据源连接失败或超时，请稍后重试'),{status:502})
      }
      await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))
    }
  }
}
module.exports={search,configured}
