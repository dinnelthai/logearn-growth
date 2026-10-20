const {specs}=require('./catalog')
const {classify}=require('./response')
function redact(value,token){if(typeof value==='string')return token?value.split(token).join('[redacted]'):value;if(Array.isArray(value))return value.map(v=>redact(v,token));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(token|password|secret|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?key)/i.test(k)).map(([k,v])=>[redact(k,token),redact(v,token)]));return value}
async function call(operation,payload,token,fetcher=fetch){
 const spec=specs.find(s=>s.key===operation),url=new URL('https://logearn.com/logearn/'+spec.path),body=operation==='coupon'?{...payload,subjects:[payload.subject]}:{...payload}
 delete body.expectedUserId
 if(operation==='coupon')delete body.subject
 if(spec.method==='GET')for(const [k,v]of Object.entries(body))url.searchParams.set(k,String(v))
 try{
  const response=await fetcher(url,{method:spec.method,headers:{'Content-Type':'application/json',logearn_token:token},...(spec.method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'})
  const reader=response.body?.getReader();let text='',size=0;const chunks=[]
  if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {state:'unknown',http_status:response.status,message:'返回内容超过64KB，请到源系统核实'}}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}}
  text=Buffer.concat(chunks).toString('utf8')
  let data;try{data=JSON.parse(text)}catch{return {state:'unknown',http_status:response.status,message:'返回不是已知 JSON 格式，请核实执行结果'}}
  const verdict=response.ok?classify(operation,payload,data):{state:response.status>=400&&response.status<500?'failed':'unknown',message:'接口返回异常，请查看响应；未自动重试'}
  return {...redact(verdict,token),http_status:response.status,response:redact(data,token)}
 }catch{return {state:'unknown',message:'请求超时或连接中断，执行结果待核实；未自动重试'}}
}
module.exports={call,redact}
