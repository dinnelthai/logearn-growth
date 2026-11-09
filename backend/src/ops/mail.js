function validate(config){
 if(!config||typeof config!=='object')throw Object.assign(Error('请填写 SMTP 配置'),{status:400})
 const {host,port,username,password,from}=config
 if(typeof host!=='string'||!host.trim()||/[\s/]/.test(host)||host.length>253||![465,587].includes(Number(port)))throw Object.assign(Error('SMTP 服务器或端口无效，请使用 465 或 587'),{status:400})
 if(typeof username!=='string'||!username.trim()||username.length>254||typeof password!=='string'||!password||password.length>4096||!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(from||''))throw Object.assign(Error('SMTP 账号、密码或发件邮箱无效'),{status:400})
 return {host:host.trim(),port:Number(port),username:username.trim(),password,from:from.trim()}
}
async function send(payload,credential,mailer=require('nodemailer')){
 try{const c=validate(JSON.parse(credential)),transport=mailer.createTransport({host:c.host,port:c.port,secure:c.port===465,requireTLS:c.port===587,auth:{user:c.username,pass:c.password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000})
  const result=await transport.sendMail({from:c.from,to:payload.email,subject:payload.subject,text:payload.text})
  return result.accepted?.length?{state:'success',message:'邮件服务器已接受',message_id:String(result.messageId||'').slice(0,500)}:{state:'failed',message:'邮件服务器未接受收件人'}
 }catch(error){const code=String(error.code||'');return {state:['EAUTH','EENVELOPE','EMESSAGE'].includes(code)?'failed':'unknown',message:code==='EAUTH'?'SMTP 认证失败':code==='EENVELOPE'?'发件人或收件人被拒绝':'SMTP 请求失败或结果待核实；未自动重试',halt_batch:code==='EAUTH'}}
}
module.exports={validate,send}
