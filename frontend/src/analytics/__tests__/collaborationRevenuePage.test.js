import {test,expect,vi} from 'vitest'
vi.mock('../../api/crm.js',()=>Object.fromEntries(['listCollaborations','createCollaboration','getCollaboration','updateCollaboration','reviewCollaboration','linkCollaborationActivity','unlinkCollaborationActivity','saveCollaborationCost','saveCollaborationRevenue','getCollaborationReport'].map(k=>[k,vi.fn()])))
vi.mock('../../api/activities.js',()=>({listActivities:vi.fn()}))
import {listCollaborations,getCollaboration,reviewCollaboration,saveCollaborationRevenue} from '../../api/crm.js'
import {listActivities} from '../../api/activities.js'
import {mountCollaborationPanel} from '../../pages/kolCollaborations.js'
test('new and edit revenue actions open forms and submit exact text amounts with the current revision',async()=>{
 const c={id:'c',name:'C',status:'active',revision:7,start_at:Date.now()-1000,end_at:Date.now()+1000},data={collaboration:c,cost_totals:[],costs:[],revenues:[{id:'r',currency:'USD',amount:'20.10',kind:'income',state:'received',reference:'receipt',description:'actual',occurred_at:Date.now()}],revenue_totals:[],currencies:{USD:2},activities:[],history:[],reports:[]}
 listCollaborations.mockResolvedValue({currencies:{USD:2},collaborations:[{...c,cost_totals:[]}]});getCollaboration.mockResolvedValue(data);reviewCollaboration.mockResolvedValue({available:false});listActivities.mockResolvedValue({activities:[]});saveCollaborationRevenue.mockResolvedValue({ok:true})
 const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{isConnected:true,dataset:{openCollab:'c',editRevenue:'r'},elements:{activity_id:{}},querySelector:s=>node(key+'/'+s),querySelectorAll:()=>[],addEventListener(){},innerHTML:''});return nodes.get(key)},host={isConnected:true,innerHTML:'',querySelector:node,querySelectorAll:s=>['[data-open-collab]','[data-edit-revenue]'].includes(s)?[node(s)]:[]}
 const panel=mountCollaborationPanel(host,{id:'k'}, {esc:String,fmt:String,table:(_h,r)=>JSON.stringify(r)})
 await vi.waitFor(()=>expect(node('[data-open-collab]').onclick).toBeTypeOf('function'));node('[data-open-collab]').onclick();await vi.waitFor(()=>expect(node('[data-new-revenue]').onclick).toBeTypeOf('function'))
 node('[data-new-revenue]').onclick();expect(node('[data-revenue-form]').innerHTML).toContain('凭证编号')
 node('[data-edit-revenue]').onclick();expect(node('[data-revenue-form]').innerHTML).toContain('20.10')
 const values={currency:'USD',amount:'20.10',kind:'income',state:'void',reference:'receipt',description:'corrected',date:'2026-10-01T12:00'}
 vi.stubGlobal('FormData',class{*[Symbol.iterator](){yield* Object.entries(values)}})
 try{node('[data-revenue-form]/form').onsubmit({preventDefault(){}});await vi.waitFor(()=>expect(saveCollaborationRevenue).toHaveBeenCalledWith('k','c','r',expect.objectContaining({amount:'20.10',expected_revision:7,state:'void',occurred_at:Date.parse('2026-10-01T12:00:00+07:00')})))}finally{vi.unstubAllGlobals();panel.dispose()}
})
