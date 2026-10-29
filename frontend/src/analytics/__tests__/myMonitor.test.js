import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchMyMonitorMetrics:vi.fn()}))
vi.mock('../../api/backendAnalytics.js',()=>({fetchBackendMeta:vi.fn()}))
import {fetchMyMonitorMetrics} from '../../api/metrics.js'
import {fetchBackendMeta} from '../../api/backendAnalytics.js'
import {createMyMonitor} from '../../pages/myMonitor.js'
const metric=(key)=>({key,label:key,formula:'formula',rate:null,numerator:0,denominator:0,pending:0,available:false,missing:['pages']})
const result={metrics:Object.fromEntries(['activation','visit_login','login_analysis','login_success','trial','d1','d7'].map(k=>[k,metric(k)])),days:[],meta:{history_complete:false}}
function setup(){const nodes=new Map(),host={innerHTML:'',querySelector:s=>nodes.get(s)|| (nodes.set(s,{}),nodes.get(s)),querySelectorAll:()=>[]};return {host,page:createMyMonitor({$:()=>host,clear:vi.fn(),esc:String,fmt:String,table:()=>'',navigate:vi.fn()})}}
beforeEach(()=>{vi.clearAllMocks();fetchBackendMeta.mockResolvedValue({as_of:'2026-10-12T05:00:00Z',snapshot_id:'s'});fetchMyMonitorMetrics.mockResolvedValue(result)})
test('missing events display awaiting integration and query is pinned to snapshot',async()=>{const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('待接入');expect(t.host.innerHTML).not.toContain('0.0%');expect(fetchMyMonitorMetrics).toHaveBeenCalledWith(expect.objectContaining({snapshot_id:'s',start:expect.any(Number),end:expect.any(Number)}))})
test('switching pages ignores a late metrics response',async()=>{let resolve;fetchMyMonitorMetrics.mockImplementation(()=>new Promise(r=>resolve=r));const t=setup(),pending=t.page.draw();await Promise.resolve();await Promise.resolve();t.page.dispose();t.host.innerHTML='next page';resolve(result);await pending;expect(t.host.innerHTML).toBe('next page')})
test('API failure displays retry without stale data',async()=>{fetchMyMonitorMetrics.mockRejectedValue(new Error('query failed'));const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('加载失败');expect(t.host.innerHTML).toContain('query failed');expect(t.host.querySelector('[data-view-retry]').onclick).toBeTypeOf('function')})
