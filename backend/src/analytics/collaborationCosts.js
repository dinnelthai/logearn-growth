const CURRENCIES={USD:2,CNY:2,THB:2,EUR:2,USDT:6}
const fail=message=>{throw Object.assign(new Error(message),{status:400})}
function parseAmount(amount,currency){
 const digits=CURRENCIES[currency];if(digits==null||typeof amount!=='string'||amount.length>24||!/^\d+(\.\d+)?$/.test(amount))fail('请选择支持的币种并填写非负十进制金额')
 const [whole,fraction='']=amount.split('.');if(fraction.length>digits)fail(currency+'金额最多'+digits+'位小数，不自动舍入')
 const minor=BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0'))
 if(minor>1000000000n*10n**BigInt(digits))fail('单条成本金额超过上限')
 return Number(minor)
}
function amountText(minor,currency){const digits=CURRENCIES[currency],raw=BigInt(minor),n=raw<0n?-raw:raw,scale=10n**BigInt(digits);return `${raw<0n?'-':''}${n/scale}.${String(n%scale).padStart(digits,'0')}`}
function costTotals(costs){const totals=new Map();for(const c of costs){if(c.state==='void')continue;if(!totals.has(c.currency))totals.set(c.currency,{currency:c.currency,planned:0n,actual:0n});totals.get(c.currency)[c.state]+=BigInt(c.amount_minor)}return [...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency)).map(t=>({currency:t.currency,planned:amountText(t.planned,t.currency),actual:amountText(t.actual,t.currency)}))}
module.exports={CURRENCIES,parseAmount,amountText,costTotals}
