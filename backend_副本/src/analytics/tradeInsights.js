const {createHash}=require('node:crypto'),DAY=86400000
const clean=x=>x==null||['','null','undefined'].includes(String(x).trim())?null:String(x).trim()
const key=(...xs)=>JSON.stringify(xs)
function validateTrade(b){if(b.end-b.start>31*DAY||b.chain!=null&&(typeof b.chain!=='string'||b.chain.length>64))throw Object.assign(new Error('交易监控支持最长31天与有效链筛选'),{status:400})}
function computeTradeInsights(events,{start,end,asOf,chain='all'}){
 const input=events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).map(e=>({...e,attempt_id:clean(e.attempt_id),trade_id:clean(e.trade_id),chain:clean(e.chain)||'未知',source:e.source||'未知'})).sort((a,b)=>a.t-b.t||String(a.event_id).localeCompare(String(b.event_id)))
 const roots=new Map(),aliases=new Map(),add=(k,b)=>{if(!aliases.has(k))aliases.set(k,new Set());aliases.get(k).add(b)}
 const attemptKey=e=>e.attempt_id?key(e.user_key,'attempt',e.attempt_id):null,tradeKey=e=>e.trade_id?key(e.user_key,'trade',e.chain,e.trade_id):null
 for(const e of input.filter(e=>e.event_name==='trade_submitted')){const root=attemptKey(e)||tradeKey(e)||key(e.user_key,'event',e.event_id);let b=roots.get(root)
  if(!b){const wallets=Number(e.wallet_count);b={id:'batch:'+roots.size,user_id:e.user_key,source:e.source,chain:e.chain,attempt_id:e.attempt_id,trade_id:e.trade_id,token_address:clean(e.token_address),submitted_at:e.t,expected_wallets:Number.isInteger(wallets)&&wallets>0&&wallets<=1000?wallets:null,orders:[],conflict:false,chains:new Set()};roots.set(root,b)}
  b.chains.add(e.chain);if(b.chains.size>1)b.conflict=true
  for(const k of [attemptKey(e),tradeKey(e)].filter(Boolean))add(k,b)
 }
 const outcomes=input.filter(e=>e.event_name!=='trade_submitted')
 function match(e){const a=attemptKey(e),t=tradeKey(e);if(a&&!aliases.has(a))return {reason:'attempt未关联所选提交'}
  const found=new Set([...(a?aliases.get(a)||[]:[]),...(t?aliases.get(t)||[]:[])])
  if(found.size>1){for(const b of found)b.conflict=true;return {reason:'关联别名冲突'}}
  const b=[...found][0];if(!b)return {reason:'未关联所选提交'}
  if(e.t<b.submitted_at)return {reason:'终态早于提交'}
  if(b.chain!=='未知'&&e.chain!=='未知'&&b.chain!==e.chain){b.conflict=true;return {reason:'提交与终态链冲突'}}
  if(!t)return {reason:'结果缺订单ID'}
  return {b}
 }
 // First establish order aliases from exact attempts; then resolve trade-only outcomes.
 for(const e of outcomes){const a=attemptKey(e),t=tradeKey(e),bs=a?aliases.get(a):null;if(t&&bs?.size===1){const b=[...bs][0];if(e.t>=b.submitted_at&&(b.chain==='未知'||e.chain==='未知'||b.chain===e.chain))add(t,b)}}
 const selected=[...roots.values()].filter(b=>b.submitted_at>=start&&b.submitted_at<end&&(chain==='all'||b.chain===chain)),selectedIds=new Set(selected.map(b=>b.id)),orderGroups=new Map(),unmatched=[]
 for(const e of outcomes){const m=match(e),b=m.b
  if(!b||!selectedIds.has(b.id)){if(e.t>=start&&e.t<end&&(chain==='all'||e.chain===chain))unmatched.push({...e,error_reason:e.reason,error_detail:clean(e.error_detail)?.slice(0,2000)||null,reason:m.reason||'提交不在所选批次'});continue}
  const k=tradeKey(e);if(!orderGroups.has(k))orderGroups.set(k,{id:'order:'+createHash('sha1').update(k).digest('hex').slice(0,20),user_id:e.user_key,source:b.source,chain:b.chain,attempt_id:b.attempt_id,trade_id:e.trade_id,token_address:clean(e.token_address)||b.token_address,submitted_at:b.submitted_at,batch_id:b.id,terminal_at:e.t,last_terminal_at:e.t,statuses:new Set(),reasons:new Set(),errorDetails:new Set(),b})
  const o=orderGroups.get(k);o.statuses.add(e.event_name==='trade_succeeded'?'succeeded':'failed');if(e.reason)o.reasons.add(e.reason);if(clean(e.error_detail))o.errorDetails.add(clean(e.error_detail).slice(0,2000));o.last_terminal_at=Math.max(o.last_terminal_at,e.t);o.terminal_at=Math.min(o.terminal_at,e.t)
 }
 const orders=[...orderGroups.values()].map(o=>{o.status=o.statuses.size>1||o.b.conflict?'conflict':[...o.statuses][0];o.reason=[...o.reasons].sort().slice(0,3).join(' / ')||(o.status==='failed'?'未提供失败原因':null);o.error_detail=[...o.errorDetails].sort().slice(0,3).join(' / ')||null;o.diagnostic_reason=o.status==='conflict'?(o.statuses.size>1?'同一订单同时上报成功和失败':'订单关联存在冲突'):null;o.latency_ms=o.terminal_at-o.submitted_at;o.b.orders.push(o);return o})
 for(const b of selected){const successes=b.orders.filter(o=>o.status==='succeeded').length,failures=b.orders.filter(o=>o.status==='failed').length
  b.mixed=successes>0&&failures>0;b.pending=!b.orders.length||(b.expected_wallets!=null&&successes+failures<b.expected_wallets);if(b.expected_wallets!=null&&b.orders.length>b.expected_wallets)b.conflict=true;b.missing=!b.attempt_id&&!b.trade_id;b.cardinality_unknown=b.expected_wallets==null;b.observed_orders=b.orders.length
  b.status=b.conflict||b.orders.some(o=>o.status==='conflict')?'conflict':b.missing?'missing':b.mixed?'mixed':b.pending?'pending':b.cardinality_unknown?'observed_only':successes?'succeeded':'failed'
 }
 const members={},lists={},put=(k,rs)=>{lists[k]=rs.map(r=>r.id);return rs.length}
 for(const b of selected){const {orders,chains,...safe}=b;members[b.id]=safe}
 for(const o of orders){const {b,statuses,reasons,errorDetails,...safe}=o;members[o.id]=safe}
 for(const b of selected){const k='batch:'+b.id+':orders';put(k,b.orders);members[b.id].orders_key=k}
 const unlinked=unmatched.map(e=>({id:'unmatched:'+e.event_id,user_id:e.user_key,source:e.source,chain:e.chain,attempt_id:e.attempt_id,trade_id:e.trade_id,terminal_at:e.t,reason:e.reason,error_reason:e.error_reason||null,error_detail:e.error_detail,reported_status:e.event_name==='trade_failed'?'failed':'succeeded',status:'unmatched'}));unlinked.forEach(r=>members[r.id]=r)
 function aggregate(bs,prefix){const ids=new Set(bs.map(b=>b.id)),os=orders.filter(o=>ids.has(o.batch_id)),suc=os.filter(o=>o.status==='succeeded'),fail=os.filter(o=>o.status==='failed'),latencies=[...suc,...fail].map(o=>o.latency_ms).sort((a,b)=>a-b)
  const r={list_key:prefix,submitted:put(prefix+':submitted',bs),succeeded:put(prefix+':succeeded',suc),failed:put(prefix+':failed',fail),conflicts:put(prefix+':conflicts',os.filter(o=>o.status==='conflict')),pending:put(prefix+':pending',bs.filter(b=>b.pending)),mixed:put(prefix+':mixed',bs.filter(b=>b.mixed)),missing:put(prefix+':missing',bs.filter(b=>b.missing)),cardinality_unknown:put(prefix+':unknown',bs.filter(b=>b.cardinality_unknown)),linked_batches:put(prefix+':linked',bs.filter(b=>b.orders.some(o=>o.status==='succeeded'||o.status==='failed'))),submitters:new Set(bs.map(b=>b.user_id)).size,traders:new Set(suc.map(o=>o.user_id)).size}
  r.success_rate=suc.length+fail.length?suc.length/(suc.length+fail.length):null;r.correlation_rate=bs.length?r.linked_batches/bs.length:null;r.median_latency_ms=latencies.length?latencies.length%2?latencies[(latencies.length-1)/2]:(latencies[latencies.length/2-1]+latencies[latencies.length/2])/2:null;return r
 }
 const total=aggregate(selected,'total'),days=[]
 for(let t=Math.floor((start+25200000)/DAY)*DAY-25200000;t<end;t+=DAY){const date=new Date(t+25200000).toISOString().slice(0,10);days.push({date,...aggregate(selected.filter(b=>b.submitted_at>=t&&b.submitted_at<Math.min(end,t+DAY)),'day:'+date)})}
 const chains=[...new Set(selected.map(b=>b.chain))].map(c=>({chain:c,...aggregate(selected.filter(b=>b.chain===c),'chain:'+c)})).sort((a,b)=>b.submitted-a.submitted)
 const reasons=[...new Set(orders.filter(o=>o.status==='failed').map(o=>o.reason))].map((reason,i)=>({reason,orders:put('reason:'+i,orders.filter(o=>o.status==='failed'&&o.reason===reason)),list_key:'reason:'+i})).sort((a,b)=>b.orders-a.orders)
 total.unmatched=put('unmatched',unlinked)
 const issues=require('./tradeIssues').tradeIssues(orders,unlinked,lists)
 const kinds=Object.fromEntries(Object.keys(lists).map(k=>[k,k.endsWith(':submitted')||k.endsWith(':pending')||k.endsWith(':mixed')||k.endsWith(':missing')||k.endsWith(':unknown')||k.endsWith(':linked')?'提交批次':'订单结果']))
 kinds.unmatched='终态记录';for(const issue of issues)kinds[issue.list_key]=issue.entity
 return {members,lists,search_fields:['id','user_id','attempt_id','trade_id','reason','error_reason','error_detail','diagnostic_reason','chain','token_address'],payload:{total,days,chains,reasons,issues,list_entities:kinds,start,end,as_of:asOf,user_pool:'submission_cohorts',unit:'linked_order_terminals',coverage:'partial',quality:{duplicate_submission_events:input.filter(e=>e.event_name==='trade_submitted'&&e.t>=start&&e.t<end&&(chain==='all'||e.chain===chain)).length-selected.length},definition:'成功率=已关联成功订单/(已关联成功+失败订单)；待确认及冲突不进入终态分母，提交批次与订单是不同单位。'}}
}
module.exports={computeTradeInsights,validateTrade}
