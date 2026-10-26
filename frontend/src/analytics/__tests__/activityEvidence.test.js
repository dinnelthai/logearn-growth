import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/activities.js',()=>({activityEvidence:vi.fn(),assignActivityEvidence:vi.fn(),recordActivityEvidence:vi.fn()}))
import {activityEvidence} from '../../api/activities.js'
import {activityEvidenceMarkup,mountActivityEvidence} from '../../pages/activityEvidence.js'
const ctx={esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmt:String,table:(h,rs)=>h.join('|')+rs.map(r=>r.join('|')).join('\n')}
const d={version:1,summary:{definition:'原始组',groups:[{group_key:'treatment',users:2,delivered:0,sent_unconfirmed:1,not_delivered:0,delivery_unknown:1,cross_exposed:1,retrospective_records:2}]},rows:[],records:[{user_id:'1',kind:'note',channel:'<chat>',evidence:'<script>',occurred_at:100,recorded_at:100}],total:2,record_total:1,offset:0,limit:20}
beforeEach(()=>vi.resetAllMocks())
test('evidence UI distinguishes sent from delivered and escapes stored content',()=>{
 const html=activityEvidenceMarkup(ctx,{id:'a'},d)
 expect(html).toContain('发送未确认');expect(html).toContain('不因未送达或跨组而排除');expect(html).toContain('&lt;script>');expect(html).not.toContain('<script>');expect(html).toContain('不发送消息')
 const frozen=activityEvidenceMarkup(ctx,{settled_at:1},d);expect(frozen).toContain('不改历史结算');expect(frozen).toMatch(/disabled>固定原始分组/)
 expect(activityEvidenceMarkup(ctx,{archived_at:1},d)).toMatch(/disabled>追加验证记录/)
})
test('late evidence success and failure cannot overwrite another page after disposal',async()=>{
 for(const fail of [false,true]){let resolve,reject;activityEvidence.mockImplementation(()=>new Promise((a,b)=>{resolve=a;reject=b}));const host={innerHTML:'',isConnected:true},panel=mountActivityEvidence(host,{id:'a'},ctx);panel.dispose();host.innerHTML='other page';if(fail)reject(Error('offline'));else resolve(d);await Promise.resolve();await Promise.resolve();expect(host.innerHTML).toBe('other page')}
})
