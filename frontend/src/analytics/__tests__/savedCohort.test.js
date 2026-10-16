import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../cohortClient.js',()=>({getCohort:vi.fn(),saveCohortVersion:vi.fn()}))
vi.mock('../../api/backendAnalytics.js',()=>({fetchBackendMeta:vi.fn()}))
vi.mock('../../api/metrics.js',()=>({fetchSegmentsMetrics:vi.fn()}))
vi.mock('../../api/drill.js',()=>({materializeAudience:vi.fn()}))
import {getCohort,saveCohortVersion} from '../cohortClient.js'
import {fetchBackendMeta} from '../../api/backendAnalytics.js'
import {fetchSegmentsMetrics} from '../../api/metrics.js'
import {materializeAudience} from '../../api/drill.js'
import {dynamicRule,resolveSavedCohort} from '../savedCohort.js'
const applied={days:28,pool:'registered',filters:{task:'analysis_no_trade'}},config={start:1,end:100,source:'all'},meta={as_of:'2026-10-15T00:00:00Z',snapshot_id:'s'}
beforeEach(()=>{vi.resetAllMocks();fetchBackendMeta.mockResolvedValue(meta)})
test('saving tag conditions retains the original base, so future tagged users can join',()=>{
 const audience={ids:['user:1'],selection:{kind:'tags',tagIds:['activity:a'],mode:'all',base:{ids:['user:1','user:2']}}}
 const r=dynamicRule({applied,config,audience});expect(r.base_ids).toEqual(['user:1','user:2']);expect(r.tag_ids).toEqual(['activity:a'])
 expect(dynamicRule({applied,config,audience:{...audience,selection:{...audience.selection,base:null}}}).base_ids).toBeNull()
 expect(dynamicRule({applied,config,audience:{ids:[]}}).base_ids).toEqual([])
})
test('dynamic cohorts recompute against a fresh snapshot and freeze the materialized result',async()=>{
 const rule=dynamicRule({applied,config});getCohort.mockResolvedValue({id:'c',kind:'dynamic',name:'动态',rule});fetchSegmentsMetrics.mockResolvedValue({total:1,drill:{cache_id:'job'}});materializeAudience.mockResolvedValue({ids:['user:2'],snapshot_id:'s',as_of:meta.as_of})
 const r=await resolveSavedCohort('c',config);expect(r.ids).toEqual(['user:2']);expect(r.selection).toEqual({kind:'cohort',id:'c'});expect(r.start).toBeLessThan(r.end)
 expect(fetchSegmentsMetrics.mock.calls[0][0]).toMatchObject({snapshot_id:'s',pool:'registered',filters:applied.filters,audience_ids:null})
 expect(materializeAudience).toHaveBeenCalledWith({cache_id:'job',list_key:'all'})
})
test('a legitimate empty dynamic result stays empty instead of expanding to all users',async()=>{
 getCohort.mockResolvedValue({kind:'dynamic',name:'empty',rule:dynamicRule({applied,config})});fetchSegmentsMetrics.mockResolvedValue({total:0,drill:{cache_id:'empty-job'}});const r=await resolveSavedCohort('c',config);expect(r.ids).toEqual([]);expect(r.count).toBe(0);expect(materializeAudience).not.toHaveBeenCalled();expect(saveCohortVersion).toHaveBeenCalledWith('c','empty-job')
})
test('static saved cohorts retain explicit IDs and the current period',async()=>{getCohort.mockResolvedValue({name:'fixed',user_ids:['1','user:1','anonymous:a']});const r=await resolveSavedCohort('c',config);expect(r.ids).toEqual(['user:1','anonymous:a']);expect(r.start).toBe(1);expect(fetchSegmentsMetrics).not.toHaveBeenCalled()})
