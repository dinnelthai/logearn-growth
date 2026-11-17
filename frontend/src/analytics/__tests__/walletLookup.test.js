import {describe,it,expect} from 'vitest'
import {parseWalletInputs,normalizeWalletAddress,walletResultStatus,walletResultsCsv} from '../../pages/walletLookup.js'
describe('旧钱包批量输入',()=>{
 it('保留顺序和重复项，支持换行及中英文分隔符',()=>{
  expect(parseWalletInputs(' 123\n0xabc， 456; 123；\n')).toEqual(['123','0xabc','456','123'])
 })
 it('将完整 EVM 地址转为小写，保留其他地址和用户 ID',()=>{
  const evm='0x'+'Ab'.repeat(20),sol='AbCd1234'
  expect(parseWalletInputs(evm+'\n'+sol+'\n123')).toEqual([evm.toLowerCase(),sol,'123'])
  expect(normalizeWalletAddress(evm)).toBe(evm.toLowerCase())
 })
})

describe('查询结果状态',()=>{
 it('区分匹配、未匹配和请求失败',()=>{
  expect(walletResultStatus({accounts:[{account_id:'1'}]})).toBe('matched')
  expect(walletResultStatus({accounts:[]})).toBe('unmatched')
  expect(walletResultStatus({error:'查询失败'})).toBe('error')
 })
})

describe('CSV导出',()=>{
 it('保留多账号、多地址与未匹配和失败，并转义表格公式',()=>{
  const csv=walletResultsCsv([{value:'=test',accounts:[]},{value:'id',accounts:[{account_id:'1',identities:[{provider:'email',subject:'a,b@example.com',verified:true}],old_wallets:[],wallets:[{chain_family:'evm',address:'0x'+'A'.repeat(40),status:'active'}]}]},{value:'x',error:'失败'}])
  expect(csv.startsWith('\ufeff')).toBe(true)
  expect(csv).toContain("'=test")
  expect(csv).toContain('a,b@example.com')
  expect(csv).toContain('0x'+'a'.repeat(40))
  expect(csv).toContain('未匹配')
  expect(csv).toContain('查询失败')
 })
 it('导出第一次被盗表的钱包地址',()=>{
  const csv=walletResultsCsv([{value:'234',accounts:[{account_id:'234',identities:[],first_stolen_wallets:[{chain_family:'solana',chain_id:'solana-mainnet',address:'FirstAddress',status:'active'}],old_wallets:[],wallets:[]}]}])
  expect(csv).toContain('第一次被盗表')
  expect(csv).toContain('FirstAddress')
 })
})
