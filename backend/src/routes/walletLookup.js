const express=require('express')
const remote=require('../data/hologres')
const transfers=require('../services/walletTransfers')
const router=express.Router()
router.post('/nfts',async(req,res,next)=>{try{const results=await require('../services/walletNft').lookupNfts(req.body?.addresses);res.set('Cache-Control','no-store').json({results})}catch(e){next(e)}})
router.post('/transfers',async(req,res,next)=>{
 try{
  const data=await transfers.queryTransfers({chainId:req.body?.chain_id,addresses:req.body?.addresses,startDate:req.body?.start_date,endDate:req.body?.end_date})
  res.set('Cache-Control','no-store').json(data)
 }catch(e){next(e)}
})
router.post('/',async(req,res,next)=>{
 try{
  const value=typeof req.body?.value==='string'?req.body.value.trim():''
  if(!value||value.length>256)return res.status(400).json({error:'请输入用户 ID、登录身份或新旧平台地址'})
  const evm=/^0x[0-9a-fA-F]{40}$/.test(value)
  const accounts=await remote.query(`SELECT DISTINCT account_id FROM (
   SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=$1
   UNION ALL
   SELECT account_id::text AS account_id FROM public.wallet_v2_old
    WHERE (CASE WHEN $2 THEN LOWER(BTRIM(address)) ELSE BTRIM(address) END)=$3
   UNION ALL
   SELECT account_id::text AS account_id FROM public.wallet_v2_old_v2
    WHERE (CASE WHEN $2 THEN LOWER(BTRIM(address)) ELSE BTRIM(address) END)=$3
   UNION ALL
   SELECT account_id::text AS account_id FROM public.wallet_v2
    WHERE (CASE WHEN $2 THEN LOWER(BTRIM(address)) ELSE BTRIM(address) END)=$3
   UNION ALL
   SELECT account_id::text AS account_id FROM public.account_identity_v2
    WHERE (CASE WHEN $2 OR provider='email' THEN LOWER(BTRIM(subject)) ELSE BTRIM(subject) END)
     = (CASE WHEN provider='email' THEN LOWER($3) ELSE $3 END)
   ) matches WHERE account_id IS NOT NULL ORDER BY account_id LIMIT 51`,[value,evm,evm?value.toLowerCase():value])
  if(accounts.length>50)return res.status(422).json({error:'匹配账号超过 50 个，请使用更精确的条件'})
  const ids=accounts.map(x=>x.account_id)
  if(!ids.length)return res.set('Cache-Control','no-store').json({accounts:[]})
  const [first,old,identities,wallets]=await Promise.all([
   remote.query('SELECT account_id::text,chain_family,chain_id,address,status FROM public.wallet_v2_old WHERE account_id::text=ANY($1::text[]) ORDER BY account_id,chain_family,chain_id,address',[ids]),
   remote.query('SELECT account_id::text,chain_family,chain_id,address,status FROM public.wallet_v2_old_v2 WHERE account_id::text=ANY($1::text[]) ORDER BY account_id,chain_family,chain_id,address',[ids]),
   remote.query("SELECT account_id::text,provider,subject,verified FROM public.account_identity_v2 WHERE account_id::text=ANY($1::text[]) ORDER BY account_id,provider,subject",[ids]),
   remote.query('SELECT account_id::text,chain_family,chain_id,address,status FROM public.wallet_v2 WHERE account_id::text=ANY($1::text[]) ORDER BY account_id,chain_family,chain_id,address',[ids])
  ])
  res.set('Cache-Control','no-store').json({accounts:ids.map(id=>({account_id:id,first_stolen_wallets:first.filter(x=>x.account_id===id),old_wallets:old.filter(x=>x.account_id===id),identities:identities.filter(x=>x.account_id===id),wallets:wallets.filter(x=>x.account_id===id)}))})
 }catch(e){next(e)}
})
module.exports=router
