'use strict';
const {createHmac}=require('node:crypto');
const {isIP}=require('node:net');
function webhookConfig(env=process.env){
 if(env.AI_AUTONOMY_EXTERNAL_NOTICES_ENABLED!=='1')return {};
 let values;try{values=JSON.parse(env.AI_AUTONOMY_WEBHOOKS_JSON||'{}')}
 catch{throw Error('Agent webhook 环境配置不是合法 JSON')}
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Webhook 授权用户配置无效');
 const result={};
 for(const [owner,entry]of Object.entries(values)){
  if(!owner||owner.length>256||typeof entry?.url!=='string'||
   typeof entry?.secret!=='string'||entry.secret.length<24)
   throw Error('Webhook 授权和签名密钥配置无效');
  let url;try{url=new URL(entry.url)}catch{throw Error('Webhook URL 无效')}
  if(url.protocol!=='https:'||url.username||url.password||
   url.hash||isIP(url.hostname)||!url.hostname.includes('.')||
   /(^|\.)(localhost|local|internal|test)$/i.test(url.hostname)||
   url.port&&url.port!=='443')
   throw Error('Webhook 仅允许服务端配置的外部 HTTPS 域名');
  result[owner]={url:url.href,secret:entry.secret};
 }
 return result;
}
async function sendAgentWebhook(item,{
 config,request=fetch,now=Date.now()
}={}){
 const recipient=config?.[item.owner_id];
 if(!recipient)throw Error('用户未授权外部日报通知');
 const message=JSON.stringify(item.payload);
 const digest=createHmac('sha256',recipient.secret).update(message).digest('hex');
 const response=await request(recipient.url,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
  headers:{'Content-Type':'application/json',
   'X-LogEarn-Idempotency-Key':item.id,
   'X-LogEarn-Signature':'sha256='+digest,
   'X-LogEarn-Timestamp':String(now)},
  body:message
 });
 if(!response.ok)
  throw Object.assign(Error('Webhook HTTP '+response.status),{httpStatus:response.status});
 return response.status;
}
module.exports={webhookConfig,sendAgentWebhook};
