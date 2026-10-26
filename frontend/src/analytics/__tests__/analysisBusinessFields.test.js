import {it,expect} from 'vitest'
import {requestDiagnosticsMarkup} from '../../pages/diagnostics.js'
it('renders analysis business outcomes without timing or cache diagnostics, including cached older responses',()=>{
 const ctx={esc:String,fmt:String,table:(h,rows)=>h.join('|')+'\n'+rows.map(r=>r.join('|')).join('\n')}
 const analysis={available:true,requests:1,users:1,success_rate:1,terminal_coverage:1,page_association_rate:1,counts:{success:1},observed_completion_rate:1,cancelled_while_waiting:0,waiting_cancel_rate:0,completed_after_leaving:0,token_association_rate:1,retries:{requests:0,linked_requests:0,success_rate:null},dimensions:{cache_hit:[{value:'true',requests:1,success_rate:1,terminal_coverage:1,users:1,list_key:'legacy'}]},errors:[],records:[{id:'r',user_id:'u',state:'success',duration_ms:9999,analysis_kind:'full_lifecycle',chain:'3',page_visit_id:'p'}],records_truncated:false,quality:{missing_id_events:0,orphan_terminals:0,conflicts:0},latency:[{state:'success',samples:1,median_ms:9999,p90_ms:9999}]}
 const html=requestDiagnosticsMarkup(ctx,{families:{analysis}})
 expect(html).toContain('主动分析结果');expect(html).toContain('成功有结果');expect(html).not.toContain('结果耗时');expect(html).not.toContain('缓存命中');expect(html).not.toContain('9.99');expect(html).not.toContain('P90')
})
