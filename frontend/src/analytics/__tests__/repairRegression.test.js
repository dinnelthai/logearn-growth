import {describe,it,expect,vi,afterEach} from 'vitest'
import {loadConfig,saveConfig} from '../configStorage.js'
import {deleteCohort,listCohorts,getCohort} from '../cohortClient.js'
const config={mode:'retention',steps:['login','token','ai','chip'],range:14,hours:24,source:'x',strategy:'backend-strategy',initial:'chip',returning:'chip'}
afterEach(()=>vi.unstubAllGlobals())
describe('valid backend settings survive refresh',()=>{
 it.each([['funnel',1],['paths',3],['channels',30],['north',30],['trade-monitor',30]])('persists %s range %i with dynamic source and strategy', (mode,range)=>{
  let value;const storage={getItem:()=>value,setItem:(_,v)=>value=v};const c={...config,mode,range}
  saveConfig(storage,c);expect(JSON.parse(value).schemaVersion).toBe(2);expect(loadConfig(storage)).toEqual(c)
 })
 it('rejects unsupported settings and persisted transient audiences',()=>{
  for(const c of [{...config,range:365},{...config,source:''},{...config,schemaVersion:99},{...config,audienceIds:[]}])expect(()=>saveConfig({setItem:vi.fn()},c)).toThrow('配置无效')
 })
})
describe('remote deletion errors are surfaced',()=>{
 it.each([401,403,404,500])('does not report success after HTTP %i',async status=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status,json:async()=>({error:'删除失败'})})))
  await expect(deleteCohort('cohort_remote')).rejects.toMatchObject({status})
  expect(localStorage.setItem).not.toHaveBeenCalled()
 })
 it('does not report success after a network error',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('offline')}))
  await expect(deleteCohort('cohort_remote')).rejects.toThrow('offline')
 })
 it('local deletion removes only the local record',async()=>{
  let value=JSON.stringify([{id:'cohort_local_a'},{id:'cohort_local_b'}]);vi.stubGlobal('localStorage',{getItem:()=>value,setItem:(_,v)=>value=v});vi.stubGlobal('fetch',vi.fn())
  expect(await deleteCohort('cohort_local_a')).toEqual({deleted:true,source:'local'});expect(JSON.parse(value)).toEqual([{id:'cohort_local_b'}]);expect(fetch).not.toHaveBeenCalled()
 })
 it('authorization errors do not resurrect cached remote cohorts',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify([{id:'cohort_remote'}])});vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:401,json:async()=>({error:'登录失效'})})))
  await expect(listCohorts()).rejects.toMatchObject({status:401});await expect(getCohort('cohort_remote')).rejects.toMatchObject({status:401})
 })
})
