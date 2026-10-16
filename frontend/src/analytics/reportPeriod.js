const DAY=86400000,OFFSET=25200000
let shared=null
export const localReportTime=t=>new Date(t+OFFSET).toISOString().slice(0,16)
export function reportPeriod({days=28,start,end,asOf=Date.now()}={}){
 if(days==='custom'){start=typeof start==='string'?Date.parse(start+':00+07:00'):start;end=typeof end==='string'?Date.parse(end+':00+07:00'):end}
 else {end=Number(asOf)+1;start=Math.floor((end+OFFSET)/DAY)*DAY-OFFSET-(Number(days)-1)*DAY}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end-start>366*DAY)throw Error('统计期须为有效的1–366天时间范围')
 return {start,end}
}
function customDefaults(value){if(value.days!=='custom'||value.start&&value.end)return value;const p=reportPeriod({days:Number(shared?.days)||28});return {...value,start:value.start||localReportTime(p.start),end:value.end||localReportTime(p.end)}}
export function rememberReportPeriod(value){value=customDefaults(value);try{if(value.days!=='custom'&&(!Number.isSafeInteger(Number(value.days))||Number(value.days)<1||Number(value.days)>366))return shared||{days:28};reportPeriod(value);shared={...value}}catch{}return shared||{days:28}}
export function inheritedReportPeriod(fallback={days:28}){return {...(shared||fallback)}}
export function periodFields(esc,state,attr='report'){
 return `<label>统计期 · UTC+7<select data-${attr}-days>${[1,3,7,14,28,30,90].map(d=>`<option value="${d}" ${Number(state.days)===d?'selected':''}>最近${d}天（含今日）</option>`).join('')}<option value="custom" ${state.days==='custom'?'selected':''}>自定义时间</option></select></label>${state.days==='custom'?`<label>开始 · UTC+7<input type="datetime-local" data-${attr}-start value="${esc(state.start||'')}" required></label><label>截止（不含）· UTC+7<input type="datetime-local" data-${attr}-end value="${esc(state.end||'')}" required></label>`:''}<span class="si-error" role="status" hidden data-${attr}-error></span>`
}
export function bindPeriod(host,state,onChange,attr='report'){
 for(const key of ['days','start','end']){const el=host.querySelector('[data-'+attr+'-'+key+']');if(el)el.onchange=e=>{state[key]=key==='days'&&e.target.value!=='custom'?Number(e.target.value):e.target.value;if(key==='days')Object.assign(state,customDefaults(state));try{reportPeriod(state);rememberReportPeriod(state);onChange(key)}catch(error){const node=host.querySelector('[data-'+attr+'-error]');if(node){node.hidden=false;node.textContent=error.message}}}}
}
