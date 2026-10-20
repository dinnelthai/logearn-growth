import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchGrowthInsights:vi.fn(),fetchValueDiagnostics:vi.fn(),fetchConversionLoss:vi.fn(),fetchTrackingAudit:vi.fn()}))
vi.mock('../../api/backendAnalytics.js',()=>({fetchBackendMeta:vi.fn()}))
import {fetchGrowthInsights} from '../../api/metrics.js'
import {fetchBackendMeta} from '../../api/backendAnalytics.js'
import {growthAlerts,growthChangeMarkup,growthQualityMarkup,growthChannelsMarkup,growthAssociationsMarkup,createGrowthInsightsPage} from '../../pages/growthInsights.js'
const time=Date.parse('2026-10-18T00:00:00Z')
const ctx={esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmt:String,table:(headers,rows)=>headers.join('|')+rows.map(r=>r.join('|')).join('\n')}
const m={start:time-7*86400000,end:time,as_of:time,previous_start:time-14*86400000,previous_end:time-7*86400000,change:{current:20,previous:40,fresh:5,resumed:2,continuing:13,absent:27,delta:-20,rate:-.5,actionable:25},dimensions:{source:[{value:'<script>',previous:40,current:20,delta:-20,list_key:'a'}]},channels:[],associations:[],quality:{history_complete:false,events:0,linked_rate:null,source_rate:null,lag_ms:7200000,events_complete_through:null,truncated:false,families:[{label:'分析请求',available:false,started_events:0,finished_events:0,missing_id_events:0}],versions:[]},drill:{cache_id:'job',snapshot_id:'snap'}}
beforeEach(()=>vi.resetAllMocks())
test('alerts require a sample floor and preserve collection uncertainty regardless of metric direction',()=>{
 expect(growthAlerts(m).join(' ')).toContain('下降 50.0%');expect(growthAlerts(m,{decline:20,minUsers:50}).join(' ')).not.toContain('下降')
 expect(growthAlerts(m).join(' ')).toContain('超过1小时');expect(growthAlerts(m).join(' ')).toContain('待接入')
})
test('change view exposes exact groups and safe drill keys without calling absence churn',()=>{
 const html=growthChangeMarkup(ctx,m);expect(html).toContain('20 − 40 = 5 + 2 − 27');expect(html).toContain('growth:absent:registered');expect(html).toContain('&lt;script>');expect(html).not.toContain('<script>');expect(html).toContain('不能确认流失')
})
test('quality uses unknown rates and explains the evidence boundary of event ratios',()=>{
 const html=growthQualityMarkup(ctx,m);expect(html).toContain('未确认');expect(html).toContain('待接入');expect(html).toContain('不能当作终态覆盖率');expect(html).not.toContain('0.0%')
})
test('channel and association views retain mature denominators, uncertainty intervals and semantic boundaries',()=>{
 const ret={returned:1,eligible:2,pending:3,rate:.5,interval:[.1,.9],list_key:'d7'}
 const html=growthChannelsMarkup(ctx,{...m,channels:[{source:'x',users:5,eligible:2,activated:1,pending:3,activation_rate:.5,activation_interval:[.1,.9],median_ms:60000,list_key:'x',d7:ret,d30:ret,trade:{available:false,error:'来源失败'}}]})
 expect(html).toContain('未成熟 3');expect(html).toContain('小样本');expect(html).toContain('来源失败');expect(html).toContain('不等于收入')
 expect(growthAssociationsMarkup(ctx,{...m,associations:[{label:'策略',groups:[{label:'满足',users:2,list_key:'s',d7:ret}]}]})).toContain('不证明某行为提高留存')
})
function setup(){
 const nodes=new Map(),node=()=>({isConnected:true,querySelector:s=>nodes.get(s)||(nodes.set(s,node()),nodes.get(s)),querySelectorAll:()=>[]})
 const host={...node(),innerHTML:''},context={...ctx,$:()=>host,dataStore:{meta:{storage:'hologres'}},clear:vi.fn()},page=createGrowthInsightsPage(context)
 context.clear.mockImplementation(()=>page.dispose());return {host,page,nodes}
}
test('page requests one server snapshot and shows retry instead of made-up zero metrics on failure',async()=>{
 fetchBackendMeta.mockResolvedValue({as_of:new Date(time).toISOString(),snapshot_id:'snap',sources:[]});fetchGrowthInsights.mockRejectedValue(Error('offline'))
 const t=setup();await t.page.draw();expect(fetchGrowthInsights.mock.calls[0][0].snapshot_id).toBe('snap');expect(t.host.innerHTML).toContain('offline');expect(t.host.innerHTML).toContain('重试');expect(t.host.innerHTML).not.toContain('20 − 40')
})
test('late growth response cannot replace the page after navigation',async()=>{
 let finish;fetchBackendMeta.mockResolvedValue({as_of:new Date(time).toISOString(),snapshot_id:'snap'});fetchGrowthInsights.mockImplementation(()=>new Promise(r=>finish=r))
 const t=setup(),pending=t.page.draw();await Promise.resolve();await Promise.resolve();t.page.dispose();t.host.innerHTML='other page';finish(m);await pending;expect(t.host.innerHTML).toBe('other page')
})
