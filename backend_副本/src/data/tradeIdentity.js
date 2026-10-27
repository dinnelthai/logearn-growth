const {pointsIdentityCte}=require('./pointsFacts')
// The same legacy-account precedence and verified-wallet identity as CRM/credits.
function tradeIdentityCte(ids='SELECT DISTINCT user_id FROM public.trading_transaction WHERE created_time<=$1::timestamptz AND transaction_time<=$1::timestamptz') {
  return pointsIdentityCte(ids)
}
function tradeIdentityFragment(){return tradeIdentityCte().replace(/^WITH /,', ')}
module.exports={tradeIdentityCte,tradeIdentityFragment}
