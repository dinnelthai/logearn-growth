const {randomUUID}=require('node:crypto')
const drafts=new Map(),TTL=15*60000,MAX_BYTES=32*1024*1024
function sweep(){for(const [id,d]of drafts)if(d.expires<=Date.now())drafts.delete(id)}
function put(owner,configuration,result){
 sweep();const content=JSON.stringify({configuration,result}),size=Buffer.byteLength(content)
 if(size>4*1024*1024)throw Object.assign(new Error('对比结果过大，请缩小范围'),{status:422})
 let bytes=[...drafts.values()].reduce((n,d)=>n+d.size,0)
 while(drafts.size>=50||bytes+size>MAX_BYTES){const key=drafts.keys().next().value;bytes-=drafts.get(key).size;drafts.delete(key)}
 const id=randomUUID();drafts.set(id,{owner,content,size,expires:Date.now()+TTL});return id
}
function get(id,owner){sweep();const d=drafts.get(id);if(!d||d.owner!==owner)throw Object.assign(new Error('对比结果不存在或已过期，请重新运行后保存'),{status:409});return JSON.parse(d.content)}
module.exports={put,get}
