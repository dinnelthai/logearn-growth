import {describe,it,expect} from 'vitest'
import {READ_PATHS,readPathsForTab} from '../../pages/growthAgentRequestPlan.js'
describe('Growth Agent lazy data plan',()=>{
 it('workspace needs no unrelated Agent requests',()=>expect(readPathsForTab('workspace')).toEqual([]))
 it('runtime and governance have disjoint read requests',()=>{
  expect(readPathsForTab('runtime')).toHaveLength(3)
  expect(readPathsForTab('governance')).toHaveLength(3)
  expect(new Set([...READ_PATHS.runtime,...READ_PATHS.governance]).size).toBe(6)
  expect(readPathsForTab('unknown')).toEqual([])
 })
})
