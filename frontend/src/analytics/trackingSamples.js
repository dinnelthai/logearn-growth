import contract from './trackingContract.json'
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v)
export function parseTrackingSamples(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>256*1024)throw Error('样本输入不能超过256KB')
 const value=text.trim();if(!value)return {event_ids:[],samples:[]}
 let inputs
 if(value.startsWith('[')||value.startsWith('{')){
  try{const parsed=JSON.parse(value);inputs=Array.isArray(parsed)?parsed:Array.isArray(parsed.events)?parsed.events:[parsed]}
  catch{try{inputs=value.split(/\r?\n/).filter(x=>x.trim()).map(line=>JSON.parse(line))}catch{throw Error('请粘贴事件数组、单条事件或逐行JSON；不要粘贴完整HAR或请求头')}}
 }else inputs=value.split(/[\s,;，；]+/)
 if(inputs.length>100)throw Error('每次最多核验100个event_id')
 const event_ids=[],samples=[],seen=new Map()
 for(const raw of inputs){
  const id=typeof raw==='string'?raw:raw?.event_id
  if(!validId(id))throw Error('event_id须为1–128位字母、数字或_.:-')
  if(!event_ids.includes(id))event_ids.push(id)
  if(typeof raw==='string')continue
  const sample={event_id:id}
  if(raw.event_name!==undefined){if(typeof raw.event_name!=='string'||!raw.event_name||raw.event_name.length>128)throw Error('event_name格式无效');sample.event_name=raw.event_name}
  if(raw.client_ts!==undefined){if(!Number.isSafeInteger(raw.client_ts))throw Error('client_ts须为毫秒整数');sample.client_ts=raw.client_ts}
  if(raw.properties!==undefined){
   if(!raw.properties||typeof raw.properties!=='object'||Array.isArray(raw.properties))throw Error('properties须为对象')
   sample.properties={}
   for(const key of contract.properties)if(Object.hasOwn(raw.properties,key)){
    const v=raw.properties[key]
    if(v!==null&&!['string','number','boolean'].includes(typeof v)||typeof v==='string'&&v.length>512||typeof v==='number'&&!Number.isFinite(v))throw Error('仅接收白名单中的短文本、数值和布尔值')
    sample.properties[key]=v
   }
  }
  const serialized=JSON.stringify(sample)
  if(seen.has(id)&&seen.get(id)!==serialized)throw Error('同一event_id的浏览器样本不一致，请核对后重试')
  if(!seen.has(id))samples.push(sample)
  seen.set(id,serialized)
 }
 return {event_ids,samples}
}
