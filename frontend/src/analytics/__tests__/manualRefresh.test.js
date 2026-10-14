import {test,expect,vi,afterEach} from 'vitest'
vi.mock('../../api/backendAnalytics.js',()=>({fetchBackendMeta:vi.fn()}))
import {fetchBackendMeta} from '../../api/backendAnalytics.js'
import {mountManualRefresh} from '../../api/remoteRefresh.js'
function setup(){const listeners={},button={hidden:true,disabled:false,textContent:'刷新数据',setAttribute:vi.fn(),removeAttribute:vi.fn(),addEventListener:(k,f)=>listeners[k]=f,removeEventListener:(k)=>delete listeners[k]},status={textContent:''}
vi.stubGlobal('document',{getElementById:id=>id==='as-refresh-data'?button:status})
const update=vi.fn();globalThis.__refreshRemoteAnalytics=update;const dispose=mountManualRefresh();return {button,status,update,dispose,click:()=>listeners.click?.()}}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetAllMocks();delete globalThis.__refreshRemoteAnalytics})
test('mounting and elapsed time never query data; only a click forces refresh',async()=>{vi.useFakeTimers();const t=setup();await vi.advanceTimersByTimeAsync(120000);expect(fetchBackendMeta).not.toHaveBeenCalled();expect(t.button.hidden).toBe(false)
fetchBackendMeta.mockResolvedValue({data_version:'same'});await t.click();expect(fetchBackendMeta).toHaveBeenCalledWith({refresh:true});expect(t.update).toHaveBeenCalledWith({data_version:'same'});expect(t.button.disabled).toBe(false)})
test('double clicks coalesce and button remains busy until the analysis completes',async()=>{let resolve;fetchBackendMeta.mockResolvedValue({});const t=setup();t.update.mockImplementation(()=>new Promise(r=>resolve=r));const a=t.click();await Promise.resolve();await t.click();expect(fetchBackendMeta).toHaveBeenCalledTimes(1);expect(t.button.disabled).toBe(true);resolve();await a;expect(t.button.textContent).toBe('刷新数据')})
test('failure keeps results and permits retry; disposal blocks a late response',async()=>{const t=setup();fetchBackendMeta.mockRejectedValueOnce(Error('offline'));await t.click();expect(t.status.textContent).toContain('保留上次结果');expect(t.update).not.toHaveBeenCalled();expect(t.button.disabled).toBe(false)
let resolve;fetchBackendMeta.mockImplementation(()=>new Promise(r=>resolve=r));const pending=t.click();t.dispose();resolve({});await pending;expect(t.update).not.toHaveBeenCalled()})
