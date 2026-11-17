const DAY=86400000
const MAX_ADDRESSES=50
const MAX_DAYS=366
const SOLANA_USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const CHAINS={
 '3':{id:'3',name:'Solana',family:'solana',env:'ASSET_RPC_SOLANA',native:'SOL',nativeDecimals:9,usdcMint:SOLANA_USDC,usdcDecimals:6},
 '56':{id:'56',name:'BSC',family:'evm',env:'ASSET_RPC_BSC',native:'BNB',nativeDecimals:18,usdcContract:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',usdcDecimals:18},
 '4663':{id:'4663',name:'Robinhood',family:'evm',env:'ASSET_RPC_ROBINHOOD',native:'ETH',nativeDecimals:18,usdcDecimals:6},
 '5042':{id:'5042',name:'Arc',family:'evm',env:'ASSET_RPC_ARC',native:'USDC',nativeDecimals:18,usdcDecimals:18},
}
const DISPLAY_ASSETS=['SOL','BNB','ETH','USDC']
const SOLANA_ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const EVM_ADDRESS=/^0x[0-9a-fA-F]{40}$/

function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function parseDate(value,name){
 if(typeof value!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(value))fail(`${name}格式应为YYYY-MM-DD`)
 const [,year,month,day]=value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
 const utc=Date.UTC(Number(year),Number(month)-1,Number(day))
 if(new Date(utc).toISOString().slice(0,10)!==value)fail(`${name}不是有效日期`)
 return utc-7*3600000
}
function parseDateRange(startDate,endDate){
 const start=parseDate(startDate,'开始日期'),end=parseDate(endDate,'结束日期')+DAY
 if(end<=start)fail('结束日期不能早于开始日期')
 if(end-start>MAX_DAYS*DAY)fail(`日期范围不能超过${MAX_DAYS}天`)
 return {start,end}
}
function validateAddress(chain,address){
 const value=String(address??'').trim()
 if(chain.family==='evm')return EVM_ADDRESS.test(value)?value.toLowerCase():null
 return SOLANA_ADDRESS.test(value)?value:null
}
function emptyAmounts(){return Object.fromEntries(DISPLAY_ASSETS.map(symbol=>[symbol,null]))}
function formatUnits(raw,decimals){
 const value=BigInt(raw),negative=value<0n,absolute=negative?-value:value
 if(!decimals)return `${negative?'-':''}${absolute}`
 const digits=absolute.toString().padStart(decimals+1,'0')
 const fraction=digits.slice(-decimals).replace(/0+$/,'')
 return `${negative?'-':''}${digits.slice(0,-decimals)}${fraction?'.'+fraction:''}`
}
function addRaw(amounts,symbol,raw,decimals){
 if(!amounts[symbol])amounts[symbol]={raw:0n,decimals}
 if(amounts[symbol].decimals!==decimals)throw Error(`${symbol}精度不一致`)
 amounts[symbol].raw+=BigInt(raw)
}
function outputAmounts(amounts){return Object.fromEntries(DISPLAY_ASSETS.map(symbol=>[symbol,amounts[symbol]?formatUnits(amounts[symbol].raw,amounts[symbol].decimals):null]))}
function parseDecimalRaw(value,decimals){
 const text=String(value??'').trim(),match=text.match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
 if(!match)throw Error('RPC金额格式无效')
 let [,sign,whole,fraction='',exponent='0']=match,digits=whole+fraction,scale=fraction.length-Number(exponent)
 if(scale<0){digits+='0'.repeat(-scale);scale=0}
 if(scale>decimals){const excess=scale-decimals;if(/[1-9]/.test(digits.slice(-excess)))throw Error('RPC金额精度超限');digits=digits.slice(0,-excess);scale=decimals}
 digits+= '0'.repeat(decimals-scale)
 const raw=BigInt(digits||'0')
 return sign==='-'?-raw:raw
}
function transferRaw(transfer,decimals){
 const value=transfer.rawContract?.value
 if(typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value))return BigInt(value)
 return parseDecimalRaw(transfer.value,decimals)
}

async function rpc(url,method,params,fetchImpl=globalThis.fetch){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now()+attempt,method,params}),signal:AbortSignal.timeout(20000)})
   if(!response.ok)throw Error(`HTTP ${response.status}`)
   const body=await response.json()
   if(body.error||body.result===undefined)throw Error(body.error?.message||'RPC error')
   return body.result
  }catch(error){if(attempt===2)throw Error(`${method}请求失败：${error.message}`);await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)))}
 }
}
function hex(value){return '0x'+BigInt(value).toString(16)}
async function blockTimestamp(url,number,fetchImpl){
 const block=await rpc(url,'eth_getBlockByNumber',[hex(number),false],fetchImpl)
 return block?Number(BigInt(block.timestamp)*1000n):null
}
async function firstBlockAtOrAfter(url,target,latest,fetchImpl){
 let low=0,high=latest+1
 while(low<high){
  const middle=Math.floor((low+high)/2),timestamp=await blockTimestamp(url,middle,fetchImpl)
  if(timestamp==null||timestamp>=target)high=middle
  else low=middle+1
 }
 return low
}
async function evmBlockRange(url,start,end,fetchImpl){
 const latest=Number(BigInt(await rpc(url,'eth_blockNumber',[],fetchImpl))),latestTime=await blockTimestamp(url,latest,fetchImpl)
 if(latestTime==null||latestTime<start)return null
 const from=await firstBlockAtOrAfter(url,start,latest,fetchImpl)
 const endFirst=latestTime<end?latest+1:await firstBlockAtOrAfter(url,end,latest,fetchImpl)
 const to=Math.min(latest,endFirst-1)
 return from<=to?{fromBlock:hex(from),toBlock:hex(to)}:null
}
function transferTime(transfer){const time=Date.parse(transfer.metadata?.blockTimestamp||'');return Number.isFinite(time)?time:null}
async function evmTransfers(chain,url,address,range,fetchImpl){
 const amounts={},base={fromBlock:range.fromBlock,toBlock:range.toBlock,toAddress:address,category:['external','internal','erc20'],withMetadata:true,excludeZeroValue:true,maxCount:'0x3e8',order:'asc'}
 let pageKey,pages=0,transferCount=0
 do{
  const params={...base};if(pageKey)params.pageKey=pageKey
  const result=await rpc(url,'alchemy_getAssetTransfers',[params],fetchImpl),transfers=Array.isArray(result.transfers)?result.transfers:[]
  pages++
  for(const transfer of transfers){
   const time=transferTime(transfer);if(time!=null&&(time<range.start||time>=range.end))continue
   const asset=String(transfer.asset||'').toUpperCase(),category=String(transfer.category||'')
   if(category==='erc20'&&asset==='USDC'){
    const contract=String(transfer.rawContract?.address||'').toLowerCase()
    if(chain.usdcContract&&contract!==chain.usdcContract)continue
    addRaw(amounts,'USDC',transferRaw(transfer,chain.usdcDecimals),chain.usdcDecimals)
   }else if(category!=='erc20'&&asset===chain.native)addRaw(amounts,chain.native,transferRaw(transfer,chain.nativeDecimals),chain.nativeDecimals)
   else continue
   transferCount++
  }
  pageKey=result.pageKey
  if(pages>=100&&pageKey)throw Error('转账记录超过查询上限，请缩小日期范围')
 }while(pageKey)
 return {amounts:outputAmounts(amounts),transfer_count:transferCount}
}
function accountKeys(transaction){return (transaction.transaction?.message?.accountKeys||[]).map(key=>typeof key==='string'?key:key.pubkey)}
function solanaTransferAmounts(transaction,address,chain){
 const amounts={},keys=accountKeys(transaction),owners=new Map()
 for(const balance of [...(transaction.meta?.preTokenBalances||[]),...(transaction.meta?.postTokenBalances||[])])if(balance.owner)owners.set(balance.accountIndex,{owner:balance.owner,mint:balance.mint})
 const instructions=[...(transaction.transaction?.message?.instructions||[]),...(transaction.meta?.innerInstructions||[]).flatMap(group=>group.instructions||[])]
 for(const instruction of instructions){
  const parsed=instruction.parsed,info=parsed?.info
  if(!parsed||!info)continue
  if(instruction.program==='system'&&parsed.type==='transfer'&&info.destination===address&&/^\d+$/.test(String(info.lamports)))addRaw(amounts,'SOL',BigInt(info.lamports),chain.nativeDecimals)
  if((instruction.program==='spl-token'||instruction.program==='spl-token-2022')&&['transfer','transferChecked'].includes(parsed.type)){
   const destination=String(info.destination||''),owner=owners.get(keys.indexOf(destination)),mint=info.mint||owner?.mint
   const tokenAmount=info.tokenAmount?.amount??info.amount
   if(owner?.owner===address&&mint===chain.usdcMint&&/^\d+$/.test(String(tokenAmount)))addRaw(amounts,'USDC',BigInt(tokenAmount),chain.usdcDecimals)
  }
 }
 return amounts
}
async function solanaAccounts(url,address,chain,fetchImpl){
 const result=await rpc(url,'getTokenAccountsByOwner',[address,{mint:chain.usdcMint},{encoding:'jsonParsed',commitment:'finalized'}],fetchImpl)
 return Array.isArray(result?.value)?result.value.map(row=>row.pubkey).filter(Boolean):[]
}
async function signaturePage(url,address,before,fetchImpl){
 const options={limit:1000,commitment:'finalized'};if(before)options.before=before
 return rpc(url,'getSignaturesForAddress',[address,options],fetchImpl)
}
async function solanaTransfers(chain,url,address,range,fetchImpl){
 const addresses=[address,...await solanaAccounts(url,address,chain,fetchImpl)],signatures=new Map(),pages=0
 for(const source of addresses){let before
  while(pages<100){
   const rows=await signaturePage(url,source,before,fetchImpl);pages++
   if(!Array.isArray(rows)||!rows.length)break
   let stop=false
   for(const row of rows){const time=Number(row.blockTime)*1000;if(Number.isFinite(time)&&time<range.start){stop=true;break}if(!row.err&&Number.isFinite(time)&&time<range.end)signatures.set(row.signature,time)}
   if(stop||rows.length<1000)break
   before=rows.at(-1).signature
  }
  if(pages>=100)throw Error('转账记录超过查询上限，请缩小日期范围')
 }
 const amounts={},errors=[];let transferCount=0,all=[...signatures.keys()]
 for(let index=0;index<all.length;index+=4){
  const batch=await Promise.all(all.slice(index,index+4).map(async signature=>{try{return await rpc(url,'getTransaction',[signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}],fetchImpl)}catch(error){errors.push(error.message);return null}}))
  for(const transaction of batch){if(!transaction)continue;const found=solanaTransferAmounts(transaction,address,chain);for(const [symbol,value] of Object.entries(found)){addRaw(amounts,symbol,value.raw,value.decimals);transferCount++}}
 }
 return {amounts:outputAmounts(amounts),transfer_count:transferCount,warnings:errors.length?[`${errors.length}条交易读取失败，结果可能不完整`]:[]}
}
async function queryTransfers({chainId,addresses,startDate,endDate,fetchImpl=globalThis.fetch}={}){
 const chain=CHAINS[String(chainId)]
 if(!chain)fail('请选择有效的查询链')
 if(!Array.isArray(addresses)||!addresses.length||addresses.length>MAX_ADDRESSES)fail(`请输入1-${MAX_ADDRESSES}个转入地址`)
 const range=parseDateRange(startDate,endDate),url=process.env[chain.env]
 if(!url)fail(`${chain.name} RPC尚未配置`,503)
 const normalized=addresses.map(address=>String(address??'').trim()),results=normalized.map((input,index)=>({input,index,address:validateAddress(chain,input)})),rangeCache={promise:null}
 let cursor=0
 async function worker(){while(cursor<results.length){const item=results[cursor++];if(!item.address){item.status='invalid_address';item.error=`不是有效的${chain.name}地址`;continue}try{let result=null;if(chain.family==='evm'){rangeCache.promise ||= evmBlockRange(url,range.start,range.end,fetchImpl);result=await rangeCache.promise}Object.assign(item,chain.family==='evm'?(result?await evmTransfers(chain,url,item.address,{...range,...result},fetchImpl):{amounts:emptyAmounts(),transfer_count:0}):await solanaTransfers(chain,url,item.address,range,fetchImpl));item.status='ok'}catch(error){item.status='error';item.error=error.message}}
 }
 await Promise.all(Array.from({length:Math.min(3,results.length)},worker))
 return {chain:{id:chain.id,name:chain.name},start_date:startDate,end_date:endDate,timezone:'UTC+7',results:results.map(({input,address,status,error,amounts,transfer_count,warnings})=>({input,address,status,error,amounts:amounts||emptyAmounts(),transfer_count:transfer_count||0,warnings:warnings||[]}))}
}
module.exports={CHAINS,DISPLAY_ASSETS,parseDateRange,formatUnits,validateAddress,queryTransfers,solanaTransferAmounts,evmBlockRange}
