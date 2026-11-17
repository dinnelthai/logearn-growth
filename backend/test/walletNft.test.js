const {test}=require('node:test'),assert=require('node:assert/strict')
const {lookupNfts}=require('../src/services/walletNft')
test('deduplicates EVM addresses and distinguishes owned, absent and failed chain checks',async()=>{
 const address='0x'+'Ab'.repeat(20),calls=[]
 const result=await lookupNfts([address,address.toLowerCase(),'not-evm'],async(chain,a)=>{calls.push([chain,a]);if(chain==='ethereum')throw Error('unavailable');return true})
 assert.equal(calls.length,2);assert.deepEqual(result[address.toLowerCase()],{base:true,ethereum:null})
})
test('rejects excessive address batches',async()=>{await assert.rejects(lookupNfts(Array(501).fill('x')),/500/)})
