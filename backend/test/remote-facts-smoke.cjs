// Explicit read-only integration test against configured Hologres.
require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true})
const assert=require('node:assert/strict')
const remote=require('../src/data/hologres')
const {features}=require('../src/data/remoteUsers')
const {userFactsCte}=require('../src/data/userFacts')
async function main(){
  try{
    const s=await remote.status(),rows=await features(s)
    const [oracle]=await remote.query(`SELECT COUNT(*) AS n FROM public.account_v2 WHERE created_at <= $1::timestamptz`,[s.snapshot_cutoff])
    assert.equal(rows.filter(r=>r.account_id!=null).length,Number(oracle.n))
    assert.equal(new Set(rows.map(r=>r.user_key)).size,rows.length)
    const empty=rows.find(r=>r.account_id!=null&&r.first_chip_at==null)
    assert(empty,'Registered users without analysis must be included')
    const drill=await remote.query(`${remote.eventsCte()}${userFactsCte()} SELECT user_key FROM product_users WHERE user_key=$2`,[s.snapshot_cutoff,empty.user_key])
    assert.equal(drill.length,1,'No-event users must remain drillable')
    const filtered=await features(s,'all',[empty.user_key])
    assert.equal(filtered.length,1);assert.equal(filtered[0].user_key,empty.user_key)
    for(const row of rows.filter(r=>r.account_id==null)){
      assert.equal(row.telegram_bound,null);assert.equal(row.email_bound,null)
      assert.equal(Number(row.trade_count),0)
    }
    const bindings=await remote.query(`SELECT provider,COUNT(DISTINCT account_id) AS n FROM public.account_identity_v2
      WHERE verified=true AND created_at <= $1::timestamptz AND account_id IN
      (SELECT account_id FROM public.account_v2 WHERE created_at <= $1::timestamptz)
      AND provider IN ('telegram','email') GROUP BY provider`,[s.snapshot_cutoff])
    for(const b of bindings)assert.equal(rows.filter(r=>r[b.provider+'_bound']===1).length,Number(b.n))
    console.log(JSON.stringify({passed:true,total:rows.length,registered:Number(oracle.n),unmatched:rows.filter(r=>r.account_id==null).length}))
  }finally{await remote.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
