const test=require('node:test')
const assert=require('node:assert/strict')
const {CHAINS,parseDateRange,formatUnits,normalizeSourceWallets,aggregateTransfers,solanaOutgoingTransfers,evmTransferItem,scanEvmOutgoing}=require('../src/services/walletOutflows')

test('日期范围使用 UTC+7 且限制366天',()=>{
 const range=parseDateRange('2026-01-01','2026-01-01')
 assert.equal(new Date(range.start).toISOString(),'2025-12-31T17:00:00.000Z')
 assert.equal(range.end-range.start,86400000)
 assert.throws(()=>parseDateRange('2026-02-30','2026-03-01'),/有效日期/)
 assert.throws(()=>parseDateRange('2026-01-01','2027-01-02'),/不能超过366天/)
})

test('EVM来源旧钱包可用于BSC、Robinhood和Arc；Solana地址只用于Solana',()=>{
 const evm='0x'+'A'.repeat(40),sol='11111111111111111111111111111111'
 const sources=[{address:evm,chain_family:'evm',account_id:'1',account_ids:['1','3']},{address:sol,chain_family:'solana',account_id:'2'}]
 assert.deepEqual(normalizeSourceWallets(sources,CHAINS[1]).map(x=>x.address),[evm.toLowerCase()])
 assert.deepEqual(normalizeSourceWallets(sources,CHAINS[1])[0].account_ids,['1','3'])
 assert.deepEqual(normalizeSourceWallets(sources,CHAINS[0]).map(x=>x.address),[sol])
})

test('转出汇总按Token合约区分，避免同名Token混算',()=>{
 const rows=aggregateTransfers([
  {symbol:'USDC',contract_address:'0x'+'1'.repeat(40),decimals:6,raw_amount:'1000000'},
  {symbol:'USDC',contract_address:'0x'+'1'.repeat(40),decimals:6,raw_amount:'2500000'},
  {symbol:'USDC',contract_address:'0x'+'2'.repeat(40),decimals:18,raw_amount:'1000000000000000000'},
 ])
 assert.equal(rows.length,2)
 assert.equal(rows.find(x=>x.contract_address==='0x'+'1'.repeat(40)).amount,'3.5')
 assert.equal(rows.find(x=>x.contract_address==='0x'+'2'.repeat(40)).amount,'1')
})

test('Solana只统计指定旧钱包转给目标钱包的SOL和SPL Token',()=>{
 const source='Source1111111111111111111111111111111111111'
 const target='Target111111111111111111111111111111111111'
 const other='Other1111111111111111111111111111111111111'
 const sourceAta='SourceAta1111111111111111111111111111111111'
 const targetAta='TargetAta1111111111111111111111111111111111'
 const tx={
  blockTime:1790000000,
  transaction:{signatures:['signature-1'],message:{accountKeys:[source,target,other,sourceAta,targetAta]}},
  meta:{
   preTokenBalances:[{accountIndex:3,owner:source,mint:'Mint11111111111111111111111111111111111111',uiTokenAmount:{decimals:6}},{accountIndex:4,owner:target,mint:'Mint11111111111111111111111111111111111111',uiTokenAmount:{decimals:6}}],
   postTokenBalances:[{accountIndex:3,owner:source,mint:'Mint11111111111111111111111111111111111111',uiTokenAmount:{decimals:6}},{accountIndex:4,owner:target,mint:'Mint11111111111111111111111111111111111111',uiTokenAmount:{decimals:6}}],
   innerInstructions:[{instructions:[
    {program:'system',parsed:{type:'transfer',info:{source,destination:target,lamports:'1000000000'}}},
    {program:'system',parsed:{type:'transfer',info:{source,destination:other,lamports:'9000000000'}}},
    {program:'spl-token',parsed:{type:'transferChecked',info:{source:sourceAta,destination:targetAta,mint:'Mint11111111111111111111111111111111111111',tokenAmount:{amount:'1234500',decimals:6}}}}
   ]}]
  }
 }
 const rows=solanaOutgoingTransfers(tx,source,target,CHAINS[0])
 assert.equal(rows.length,2)
 assert.equal(rows.find(x=>x.symbol==='SOL').amount,'1')
 assert.equal(rows.find(x=>x.category==='spl-token').amount,'1.2345')
 assert.ok(rows.every(x=>x.tx_hash==='signature-1'))
})

test('EVM转出交易保留目标、来源、合约和精确金额',()=>{
 const chain=CHAINS[1]
 const row=evmTransferItem(chain,{category:'erc20',asset:'USDT',from:'0x'+'a'.repeat(40),to:'0x'+'b'.repeat(40),hash:'0xhash',value:'1.25',rawContract:{address:'0x'+'c'.repeat(40),decimal:'6',value:'0x1312d00'},metadata:{blockTimestamp:'2026-01-01T00:00:00.000Z'}})
 assert.equal(row.symbol,'USDT')
 assert.equal(row.amount,'20')
 assert.equal(row.source_address,'0x'+'a'.repeat(40))
 assert.equal(row.target_address,'0x'+'b'.repeat(40))
 assert.equal(formatUnits(1000000000n,9),'1')
})

test('EVM历史查询同时限制来源旧钱包、转出目标地址和时间区间',async()=>{
 const chain=CHAINS[1]
 const range=parseDateRange('2026-01-01','2026-01-01')
 const source='0x'+'a'.repeat(40),target='0x'+'b'.repeat(40)
 let transferParams
 const fetchImpl=async(_url,options)=>{
  const request=JSON.parse(options.body)
  let result
  if(request.method==='eth_blockNumber')result='0x1'
  else if(request.method==='eth_getBlockByNumber'){
   const number=Number(BigInt(request.params[0]))
   const time=number===0?range.start-1000:range.start+1000
   result={timestamp:'0x'+Math.floor(time/1000).toString(16)}
  }else if(request.method==='alchemy_getAssetTransfers'){
   transferParams=request.params[0]
   result={transfers:[{category:'external',asset:'BNB',from:source,to:target,value:'2',hash:'0xtransfer',metadata:{blockTimestamp:'2026-01-01T00:00:00.000Z'}}]}
  }else throw Error('unexpected method '+request.method)
  return {ok:true,json:async()=>({jsonrpc:'2.0',id:request.id,result})}
 }
 const rows=await scanEvmOutgoing(chain,'https://rpc.example',source,target,range,fetchImpl)
 assert.equal(transferParams.fromAddress,source)
 assert.equal(transferParams.toAddress,target)
 assert.ok(transferParams.category.includes('erc20'))
 assert.equal(rows.length,1)
 assert.equal(rows[0].amount,'2')
 assert.equal(rows[0].tx_hash,'0xtransfer')
})
