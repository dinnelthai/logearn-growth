const platforms=['x','blog','youtube']
function normalizeContent(input){
  if(!platforms.includes(input.platform))throw Error('不支持的渠道')
  const title=String(input.title||'').trim();if(!title||title.length>200)throw Error('请填写内容标题（最多200字）')
  let url;try{url=new URL(input.url)}catch{throw Error('请输入有效的内容链接')}
  if(!['http:','https:'].includes(url.protocol))throw Error('链接必须使用 HTTP 或 HTTPS')
  const impressions=input.impressions==null||input.impressions===''?null:Number(input.impressions)
  if(impressions!==null&&(!Number.isSafeInteger(impressions)||impressions<0))throw Error('曝光必须是非负整数')
  const published_at=input.published_at||null;if(published_at&&!Number.isFinite(Date.parse(published_at)))throw Error('发布日期无效')
  const metrics={}
  for(const key of ['likes','comments','shares']){const value=input[key]==null||input[key]===''?null:Number(input[key]);if(value!==null&&(!Number.isSafeInteger(value)||value<0))throw Error('互动指标必须是非负整数');metrics[key]=value}
  const review={}
  for(const key of ['audience_fit','actionability','evidence']){const raw=input[key];const value=raw==null||raw===''?null:Number(raw);if(value!==null&&(!Number.isInteger(value)||value<0||value>2))throw Error('内容评价须为0、1或2');review[key]=value}
  review.review_note=String(input.review_note||'').trim().slice(0,1000)
  return {platform:input.platform,title,url:url.href,published_at,topic:String(input.topic||'').trim().slice(0,100),impressions,...metrics,...review}
}
function trackingUrl(platform,id){if(!platforms.includes(platform))throw Error('不支持的渠道');const url=new URL('https://logearn.com/');for(const [k,v] of Object.entries({utm_source:platform,utm_medium:platform==='x'?'owned_social':platform==='youtube'?'owned_video':'owned_blog',utm_content:String(id)}))url.searchParams.set(k,v);return url.href}
function summarize(items){return Object.fromEntries(platforms.map(p=>{const rows=items.filter(x=>x.platform===p);return [p,{count:rows.length,impressions:rows.length&&rows.every(x=>x.impressions!=null)?rows.reduce((n,x)=>n+x.impressions,0):null}]}))}
function evaluateValue(item){const values=['audience_fit','actionability','evidence'].map(k=>item[k]);if(values.some(v=>v==null))return {score:null,max:6,level:'待完整评价'};const score=values.reduce((a,b)=>a+b,0);return {score,max:6,level:score>=5?'较强':score>=3?'可改进':'待加强'}}
function reviewTrend(items){const weeks=new Map();for(const item of items){if(!/^\d{4}-\d{2}-\d{2}$/.test(item.published_at||''))continue;const d=new Date(item.published_at+'T00:00:00Z');if(!Number.isFinite(d.getTime()))continue;d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const week=d.toISOString().slice(0,10),entry=weeks.get(week)||{week,reviewed:0,total:0,sum:0};entry.total++;const result=evaluateValue(item);if(result.score!=null){entry.reviewed++;entry.sum+=result.score}weeks.set(week,entry)}return [...weeks.values()].sort((a,b)=>b.week.localeCompare(a.week)).map(({week,reviewed,total,sum})=>({week,reviewed,total,average:reviewed?Math.round(sum/reviewed*10)/10:null}))}
function performanceTrend(items){return Object.fromEntries(platforms.map(platform=>{const groups=new Map();for(const item of items.filter(i=>i.platform===platform)){if(!/^\d{4}-\d{2}-\d{2}$/.test(item.published_at||''))continue;const d=new Date(item.published_at+'T00:00:00Z');if(!Number.isFinite(d.getTime()))continue;d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const week=d.toISOString().slice(0,10);if(!groups.has(week))groups.set(week,[]);groups.get(week).push(item)}return [platform,[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([week,rows])=>{const entry={week,count:rows.length};for(const key of ['impressions','likes','comments','shares'])entry[key]=rows.every(i=>i[key]!=null)?rows.reduce((a,i)=>a+i[key],0):null;return entry})]}))}
module.exports={normalizeContent,trackingUrl,summarize,evaluateValue,reviewTrend,performanceTrend}
