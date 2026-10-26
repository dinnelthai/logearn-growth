import {test,expect} from 'vitest'
import {growthCohortsMarkup,growthEvidenceMarkup} from '../../pages/growthCohorts.js'
import {growthAlerts,growthQualityMarkup} from '../../pages/growthInsights.js'
const ctx={esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmt:String,table:(h,rs)=>h.join('|')+rs.map(r=>r.join('|')).join('\n')}
const metric={users:4,eligible:3,activated:1,pending:1,rate:1/3,list_key:'registered'}
test('registration and revisit views preserve unavailable, mature and pending states with exact drill keys',()=>{
 const m={cohorts:{observed:{...metric,list_key:'observed'},registration:{available:false,error:'<offline>',scope:'all'},repeats:[{...metric,label:'另日',list_key:'repeat',returned:0,observed_returned:1,rate:0}],definition:'limited'}}
 let html=growthCohortsMarkup(ctx,m);expect(html).toContain('&lt;offline>');expect(html).toContain('含未成熟');expect(html).toContain('repeat:observed_returned');expect(html).toContain('不是D7留存')
 html=growthCohortsMarkup(ctx,{...m,cohorts:{...m.cohorts,registration:{available:true,scope:'observed_source',metrics:metric}}});expect(html).toContain('账号注册时间');expect(html).toContain('registered:eligible');expect(html).toContain('不是全平台注册队列')
 expect(growthCohortsMarkup(ctx,{})).toContain('历史结果未包含')
})
test('one user with many requests still triggers representativeness warning and coverage table escapes dimensions',()=>{
 const q={history_complete:false,lag_ms:0,events:1000,linked_rate:1,source_rate:1,families:[{label:'分析请求',available:true,users:1,started_events:500,finished_events:500,missing_id_events:0}],versions:[],diagnostic_coverage:{available:true,rows:[{scope:'device_version',family:'analysis',device:'<mobile>',app_version:'<v>',diagnostics_version:'2',users:1,events:1000}],definition:'用户不可相加'}}
 expect(growthAlerts({quality:q,change:{previous:0}}).join('')).toContain('1 位诊断用户、500 条发起事件')
 const html=growthQualityMarkup(ctx,{quality:q});expect(html).toContain('去重诊断用户');expect(html).toContain('&lt;mobile>');expect(html).not.toContain('<mobile>')
 const evidence=growthEvidenceMarkup(ctx,{start:1,end:2,as_of:3,quality:q});expect(evidence).toContain('UTC+7');expect(evidence).toContain('连续采集确认截至：未知');expect(evidence).toContain('不等于请求成功或用户理解')
})
