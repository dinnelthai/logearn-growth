const test=require('node:test')
const assert=require('node:assert/strict')
const {CHAINS,parseDateRange,formatUnits,validateAddress,solanaTransferAmounts}=require('../src/services/walletTransfers')

test('日期范围按 UTC+7 解析并限制最大跨度',()=>{
 const range=parseDateRange('2026-01-01','2026-01-01')
 assert.equal(new Date(range.start).toISOString(),'2025-12-31T17:00:00.000Z')
 assert.equal(range.end-range.start,86400000)
 assert.throws(()=>parseDateRange('2026-02-30','2026-03-01'),/有效日期/)
 assert.throws(()=>parseDateRange('2026-01-01','2027-01-02'),/不能超过366天/)
})

test('地址校验按选择的链严格区分 EVM 和 Solana',()=>{
 const evm='0x'+'A'.repeat(40),sol='1'.repeat(32)
 assert.equal(validateAddress(CHAINS['56'],evm),evm.toLowerCase())
 assert.equal(validateAddress(CHAINS['56'],sol),null)
 assert.equal(validateAddress(CHAINS['3'],sol),sol)
 assert.equal(validateAddress(CHAINS['3'],evm),null)
})

test('金额格式化保留整数精度且去除无意义尾零',()=>{
 assert.equal(formatUnits('1000000000000000001',18),'1.000000000000000001')
 assert.equal(formatUnits('1000000',6),'1')
 assert.equal(formatUnits('1',6),'0.000001')
})

test('Solana 只累计目标 owner 收到的 SOL 和 USDC',()=>{
 const address='Owner111111111111111111111111111111111111111'
 const tokenAccount='Token11111111111111111111111111111111111111'
 const otherToken='Other1111111111111111111111111111111111111'
 const tx={
  transaction:{message:{accountKeys:[address,tokenAccount,otherToken]}},
  meta:{
   preTokenBalances:[{accountIndex:1,owner:address,mint:CHAINS['3'].usdcMint}],
   postTokenBalances:[{accountIndex:1,owner:address,mint:CHAINS['3'].usdcMint}],
   innerInstructions:[{instructions:[{program:'system',parsed:{type:'transfer',info:{destination:address,lamports:'1000000001'}}},{program:'spl-token',parsed:{type:'transferChecked',info:{destination:tokenAccount,mint:CHAINS['3'].usdcMint,tokenAmount:{amount:'1234567',decimals:6}}}},{program:'spl-token',parsed:{type:'transfer',info:{destination:otherToken,mint:CHAINS['3'].usdcMint,amount:'999'}}}]}]
  }
 }
 const amounts=solanaTransferAmounts(tx,address,CHAINS['3'])
 assert.equal(amounts.SOL.raw,1000000001n)
 assert.equal(amounts.USDC.raw,1234567n)
})
