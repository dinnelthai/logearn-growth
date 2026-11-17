'use strict'
const HOUR=3600000
function selectSnapshots(report,now=Date.now()){
 if(!report.valuation?.available||report.chains.length!==4)throw Error('资产报价或链数据不完整')
 const valid=s=>s.state==='complete'&&Number.isInteger(s.wallets)&&s.wallets>=0&&s.scanned===s.wallets&&s.failed===0&&Number.isFinite(s.total_usd)
 const hours=report.chains[0].snapshots.filter(valid).map(s=>s.hour).filter(h=>h<=now&&report.chains.every(c=>c.snapshots.some(s=>s.hour===h&&valid(s)))).sort((a,b)=>b-a)
 const currentHour=hours[0];if(currentHour==null||now-currentHour>2*HOUR)throw Error('没有近期完整的四链快照')
 const current=report.chains.map(c=>({name:c.name,value:c.snapshots.find(s=>s.hour===currentHour).total_usd}))
 const previous=report.chains.map(c=>c.snapshots.find(s=>s.hour===currentHour-24*HOUR&&valid(s))?.total_usd??null)
 return {currentHour,current,previous}
}
function money(n){return '$'+n.toFixed(2)}
function change(value,old,baseline){if(baseline||old==null)return '首日基线';const delta=value-old;return (delta>=0?'+':'-')+money(Math.abs(delta))+(old>0?'（余额环比 '+(delta>=0?'+':'')+(delta/old*100).toFixed(1)+'%）':'（前日余额为零）')}
function buildMessage(data,baseline){
 const {current,previous,currentHour}=data,total=current.reduce((n,c)=>n+c.value,0),previousTotal=previous.every(v=>v!=null)?previous.reduce((a,b)=>a+b,0):null
 const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(currentHour))
 return ['LogEarn 平台资产日报',`已完成采集的快照时间：${time}（UTC+7）`,`平台总余额：${money(total)}｜24小时变化：${change(total,previousTotal,baseline)}`,'','平台链汇总：',...current.map((c,i)=>`${c.name}：${money(c.value)}｜${change(c.value,previous[i],baseline)}`),'','统计范围：注册用户关联的活跃及归档钱包；仅包含系统采集的指定币种，不含其他代币及 DeFi 仓位。24小时变化使用同一组当前报价重估，不等同于净流入或收入。'].join('\n')
}
function start(){
 const url=process.env.FEISHU_ASSET_WEBHOOK;if(!url)return
 const cron=require('node-cron'),db=require('../db/connection'),assets=require('./platformAssets'),valuation=require('./assetValuation')
 db.exec('CREATE TABLE IF NOT EXISTS platform_asset_daily_reports (day TEXT PRIMARY KEY, state TEXT NOT NULL, created_at INTEGER NOT NULL)')
 let busy=false
 async function send(){if(busy)return;busy=true;try{
  const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(now))
  if(db.prepare('SELECT 1 FROM platform_asset_daily_reports WHERE day=?').get(day))return
  await valuation.prices();const selected=selectSnapshots(await valuation.valuate(assets.report(7)),now)
  const baseline=!db.prepare("SELECT 1 FROM platform_asset_daily_reports WHERE state='sent' LIMIT 1").get()
  if(!baseline&&selected.previous.some(v=>v==null))throw Error('缺少24小时前的完整快照，无法计算变化')
  const text=buildMessage(selected,baseline)
  const claimed=db.prepare("INSERT OR IGNORE INTO platform_asset_daily_reports VALUES (?,'sending',?)").run(day,now);if(!claimed.changes)return
  try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg_type:'text',content:{text}}),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok||result.code!==0)throw Error('飞书拒绝请求');db.prepare("UPDATE platform_asset_daily_reports SET state='sent' WHERE day=?").run(day);console.info('[asset-daily] sent',day)}catch(e){db.prepare("UPDATE platform_asset_daily_reports SET state='unknown' WHERE day=?").run(day);throw e}
 }catch(e){console.error('[asset-daily]',e.message)}finally{busy=false}}
 const task=cron.schedule('0 8 * * *',send,{timezone:'Asia/Bangkok'});console.info('[asset-daily] scheduled at 08:00 Asia/Bangkok');return ()=>task.stop()
}
module.exports={start,selectSnapshots,buildMessage}
