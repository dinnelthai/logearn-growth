import {test,expect} from 'vitest'
import {normalizeRemoteTotal,lastRemotePage,remotePageCorrection} from '../../components/remotePaging.js'

test('a shrinking remote list clamps a stale requested page and requires one real refetch',()=>{
  expect(remotePageCorrection({page:4,total:15,pageSize:10})).toEqual({page:1,refetch:true})
  expect(remotePageCorrection({page:1,total:15,pageSize:10})).toEqual({page:1,refetch:false})
  expect(remotePageCorrection({page:4,total:0,pageSize:10})).toEqual({page:0,refetch:false})
})

test('an empty, malformed or unknown server total cannot invent pages or records',()=>{
  for(const total of [undefined,null,-1,NaN,Infinity,'bad']){
    expect(normalizeRemoteTotal(total)).toBe(0)
    expect(lastRemotePage(total,12)).toBe(0)
  }
  expect(lastRemotePage(24,12)).toBe(1)
  expect(lastRemotePage(25,12)).toBe(2)
  expect(remotePageCorrection({page:-7,total:24,pageSize:12})).toEqual({page:0,refetch:false})
})
