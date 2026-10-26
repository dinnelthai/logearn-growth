import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchPathDetails:vi.fn()}))
vi.mock('../../pages/pageVisits.js',()=>({pageVisitsMarkup:vi.fn(()=>'<p>诊断已加载</p>'),bindPageVisits:vi.fn()}))
import {fetchPathDetails} from '../../api/metrics.js'
import {pageVisitsMarkup} from '../../pages/pageVisits.js'
import {mountPathDetails} from '../../pages/pathDetails.js'
const ctx={esc:s=>String(s).replaceAll('<','&lt;')},full={page_visits:{sessions:0},drill:{snapshot_id:'snap'}}
function setup(){const toggle={open:false},retry={},target={innerHTML:'',querySelector:()=>retry,querySelectorAll:()=>[]},host={innerHTML:'',isConnected:true,querySelector:s=>s==='[data-path-details-toggle]'?toggle:target};const panel=mountPathDetails(host,ctx,{cacheId:'original-job',snapshotId:'snap'});return {host,toggle,target,retry,panel}}
const flush=async()=>{await Promise.resolve();await Promise.resolve()}
beforeEach(()=>vi.resetAllMocks())
test('details make no request until expanded, use only original job, and are loaded once',async()=>{
 fetchPathDetails.mockResolvedValue(full);pageVisitsMarkup.mockReturnValue('<p>诊断已加载</p>');const t=setup();expect(fetchPathDetails).not.toHaveBeenCalled();t.toggle.open=true;t.toggle.ontoggle();t.toggle.ontoggle();await flush();expect(fetchPathDetails).toHaveBeenCalledTimes(1);expect(fetchPathDetails).toHaveBeenCalledWith('original-job');expect(t.target.innerHTML).toContain('诊断已加载');t.toggle.open=false;t.toggle.ontoggle();t.toggle.open=true;t.toggle.ontoggle();await flush();expect(fetchPathDetails).toHaveBeenCalledTimes(1)
})
test('mismatched snapshot is rejected, errors are escaped and retry keeps original job',async()=>{
 fetchPathDetails.mockResolvedValueOnce({...full,drill:{snapshot_id:'different'}}).mockRejectedValueOnce(Error('<offline>')).mockResolvedValue(full);pageVisitsMarkup.mockReturnValue('loaded');const t=setup();t.toggle.open=true;t.toggle.ontoggle();await flush();expect(t.target.innerHTML).toContain('快照与路径不一致');await t.retry.onclick();expect(t.target.innerHTML).toContain('&lt;offline>');await t.retry.onclick();expect(t.target.innerHTML).toBe('loaded');expect(fetchPathDetails.mock.calls.every(c=>c[0]==='original-job')).toBe(true)
})
test('leaving the page blocks both late success and failure from replacing the next page',async()=>{
 for(const fail of [false,true]){let resolve,reject;fetchPathDetails.mockImplementation(()=>new Promise((a,b)=>{resolve=a;reject=b}));const t=setup();t.toggle.open=true;t.toggle.ontoggle();t.panel.dispose();t.target.innerHTML='another page';if(fail)reject(Error('offline'));else resolve(full);await flush();expect(t.target.innerHTML).toBe('another page')}
})
