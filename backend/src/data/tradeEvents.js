const remote=require('./hologres')
async function tradeEvents(s,body,audience){
 const rows=await remote.query(`${remote.eventsCte()} SELECT e.user_key,e.event_id,e.event_name,e.client_ts,f.source,
 COALESCE(NULLIF(e.properties->>'chain',''),NULLIF(e.chain,'')) AS chain,
 e.properties->>'trade_attempt_id' AS attempt_id,e.properties->>'trade_id' AS trade_id,
 COALESCE(NULLIF(e.properties->>'error_message',''),NULLIF(e.properties->>'error_detail','')) AS error_detail,
 e.properties->>'wallet_count' AS wallet_count,e.properties->>'reason' AS reason,e.properties->>'token_address' AS token_address
 FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.event_name IN('trade_submitted','trade_succeeded','trade_failed')
 AND e.client_ts<=$2 AND ($3::text='all' OR f.source=$3) AND ($4::text[] IS NULL OR e.user_key=ANY($4))
 ORDER BY e.client_ts,e.event_id LIMIT 150001`,[s.snapshot_cutoff,Date.parse(s.as_of),body.source||'all',audience])
 if(rows.length>150000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)throw Object.assign(new Error('交易关联事件超过预算，请缩小来源或受众'),{status:422})
 return rows.map(r=>({...r,t:Number(r.client_ts)}))
}
module.exports={tradeEvents}
