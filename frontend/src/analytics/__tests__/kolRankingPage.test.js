import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../pages/kolCollaborations.js',()=>({mountCollaborationPanel:vi.fn()}))
vi.mock('../../api/crm.js',()=>({listKols:vi.fn(),getKol:vi.fn(),saveKol:vi.fn(),fetchKolMetrics:vi.fn(),addFollowup:vi.fn(),linkKolActivity:vi.fn(),unlinkKolActivity:vi.fn(),fetchKolRanking:vi.fn()}))
import {fetchKolRanking,fetchKolMetrics} from '../../api/crm.js'
import {createKolCrm} from '../../pages/kolCrm.js'
function data(offset=0){return {kols:[{id:'k'+offset,name:'KOL '+offset,platform:'X',stage:'待联系',metric:{total:{users:2,analysis_users:1,analysis_rate:.5,analysis_events:10,analysis_days:1,transactions:0,volume_usd:null}}}],total:70,summary:{total:70,due:0},assignees:[],snapshot_id:'fixed',list_version:'v1',start:100,end:200,as_of:'2026-10-15T00:00:00Z'}}
function setup(){const nodes=new Map(),tableNode={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null},host={innerHTML:'',querySelector:s=>s==='[data-crm-table]'?tableNode:nodes.get(s)||(nodes.set(s,{}),nodes.get(s)),querySelectorAll:()=>[]},ctx={$:()=>host,clear:vi.fn(),esc:String,fmt:String,table:(_h,rows)=>JSON.stringify(rows)};return {page:createKolCrm(ctx),host,nodes,tableNode}}
beforeEach(()=>{vi.resetAllMocks();fetchKolRanking.mockImplementation(body=>Promise.resolve(data(body.offset)))})
test('the list delegates ranking before pagination and retains its snapshot and period for page two',async()=>{
 const t=setup();await t.page.draw();expect(fetchKolMetrics).not.toHaveBeenCalled();t.nodes.get('[data-crm-sort]').onchange({target:{value:'analysis_events'}});await vi.waitFor(()=>expect(fetchKolRanking).toHaveBeenCalledTimes(2));await Promise.resolve()
 await t.nodes.get('[data-crm-next]').onclick();expect(fetchKolRanking.mock.calls.at(-1)[0]).toMatchObject({offset:50,sort:'analysis_events',scope:'tagged',snapshot_id:'fixed',list_version:'v1',start:100,end:200});expect(t.tableNode.innerHTML).toContain('KOL 50');expect(t.tableNode.innerHTML).toContain('—')
 t.nodes.get('[data-crm-scope]').onchange({target:{value:'invited'}});await vi.waitFor(()=>expect(fetchKolRanking).toHaveBeenCalledTimes(4));expect(fetchKolRanking.mock.calls.at(-1)[0]).toMatchObject({scope:'invited',offset:0,snapshot_id:null,list_version:null})
})
test('a late ranking response cannot replace the next page and failed ranking never falls back to a page-local sort',async()=>{
 let finish;fetchKolRanking.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw();t.page.dispose();t.host.innerHTML='other page';finish(data());await pending;expect(t.host.innerHTML).toBe('other page')
 fetchKolRanking.mockRejectedValue(Error('ranking budget exceeded'));await t.page.draw();expect(t.host.innerHTML).toContain('ranking budget exceeded');expect(fetchKolMetrics).not.toHaveBeenCalled()
})
