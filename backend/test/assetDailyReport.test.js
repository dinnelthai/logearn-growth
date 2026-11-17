process.env.DB_PATH=':memory:'
const {test}=require('node:test'),assert=require('node:assert/strict')
const {buildMessage,selectSnapshots}=require('../src/services/assetDailyReport')
const hour=3600000,now=100*hour
function report(){return {valuation:{available:true},chains:['BSC','Solana','Arc','Robinhood'].map((name,i)=>({name,snapshots:[{hour:75*hour,state:'complete',wallets:10,scanned:10,failed:0,total_usd:10+i},{hour:99*hour,state:'complete',wallets:10,scanned:10,failed:0,total_usd:20+i}]}))}}
test('uses same-hour complete four-chain snapshots and reports baseline or change',()=>{const selected=selectSnapshots(report(),now);assert.equal(selected.currentHour,99*hour);assert.match(buildMessage(selected,true),/首日基线/);const msg=buildMessage(selected,false);assert.match(msg,/\+\$40\.00/);assert.match(msg,/BSC/)} )
test('rejects stale, missing or unvalued snapshots rather than reporting partial assets',()=>{const data=report();data.chains[0].snapshots[1].state='failed';assert.throws(()=>selectSnapshots(data,now));const bad=report();bad.valuation.available=false;assert.throws(()=>selectSnapshots(bad,now))})

test('never uses an incomplete 08:00 batch and falls back to the latest completed common batch',()=>{const data=report();for(const c of data.chains)c.snapshots.push({hour:100*hour,state:'running',wallets:10,scanned:3,failed:0,total_usd:999});assert.equal(selectSnapshots(data,now).currentHour,99*hour);data.chains[0].snapshots[1].scanned=9;assert.throws(()=>selectSnapshots(data,now));data.chains[0].snapshots[1].scanned=10;data.chains[0].snapshots[1].failed=1;assert.throws(()=>selectSnapshots(data,now))})
