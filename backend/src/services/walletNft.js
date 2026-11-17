'use strict'
const chains={base:{id:8453,url:process.env.NFT_RPC_BASE||'https://base-rpc.publicnode.com',contract:'0x67a995A13c677098d9da7a9F7F3e1815540a2FF6'},ethereum:{id:1,url:process.env.NFT_RPC_ETHEREUM||'https://ethereum-rpc.publicnode.com',contract:'0xA2371fb07E8F946F47bB5Edb70440f3eEdC40B7C'}}
async function rpc(url,method,params){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('RPC unavailable');const body=await response.json();if(body.error||typeof body.result!=='string')throw Error('RPC error');return body.result}
async function lookupNfts(addresses,check){
 if(!Array.isArray(addresses)||addresses.length>500)throw Object.assign(Error('最多查询 500 个地址'),{status:400})
 const unique=[...new Set(addresses.filter(a=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)).map(a=>a.toLowerCase()))],result=Object.fromEntries(unique.map(a=>[a,{base:null,ethereum:null}]))
 if(!check){const verified={};await Promise.all(Object.entries(chains).map(async([key,c])=>{try{verified[key]=BigInt(await rpc(c.url,'eth_chainId',[]))===BigInt(c.id)}catch{verified[key]=false}}));check=async(key,address)=>{if(!verified[key])throw Error('RPC unavailable');const c=chains[key],value=await rpc(c.url,'eth_call',[{to:c.contract,data:'0x70a08231'+address.slice(2).padStart(64,'0')},'latest']);if(!/^0x[0-9a-f]{64}$/i.test(value))throw Error('Invalid balance');return BigInt(value)>0n}}
 const jobs=unique.flatMap(address=>Object.keys(chains).map(chain=>({address,chain})));let cursor=0
 async function worker(){while(cursor<jobs.length){const {address,chain}=jobs[cursor++];try{result[address][chain]=await check(chain,address)}catch{result[address][chain]=null}}}
 await Promise.all(Array.from({length:Math.min(6,jobs.length)},worker));return result
}
module.exports={lookupNfts}
