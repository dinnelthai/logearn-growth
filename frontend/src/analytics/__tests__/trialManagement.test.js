import {test,expect,vi,afterEach} from 'vitest'
vi.mock('../../auth/authClient.js',()=>({getToken:()=> 'token',notifyExpiredSession:vi.fn()}))
import {createTrialManagement} from '../../pages/trialManagement.js'
afterEach(()=>vi.unstubAllGlobals())
test('renders after clearing the previous page and ignores responses after disposal',async()=>{const nodes=new Map(),host={innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s)},querySelectorAll:()=>[]};let page;const ctx={$:()=>host,esc:String,clear:()=>page?.dispose(),analyzeAudience:vi.fn()};vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url.endsWith('/summary')?{records:0,users:0,ids:[],as_of:'now',start:0,end:0,total:null}:{trials:[]}})));page=createTrialManagement(ctx);await page.draw();expect(host.innerHTML).toContain('试用用户管理');expect(host.innerHTML).toContain('试用整体表现')})
