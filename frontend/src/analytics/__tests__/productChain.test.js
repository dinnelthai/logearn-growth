import {describe,it,expect} from 'vitest'
import {productChainMarkup} from '../../pages/productChain.js'
describe('product chain evidence and actions',()=>{
 it('separates capture gaps and pending windows and links exact snapshot lists',()=>{
 const ctx={esc:v=>String(v).replaceAll('<','&lt;'),fmt:String,table:(heads,rows)=>rows.map(r=>r.join('|')).join('\n')},stages=['Token详情','主动发起分析','分析成功','提交交易','交易成功'].map((label,i)=>({label,visits:i?0:2,users:i?0:1,list_key:'chain:stage:'+i})),drops=stages.slice(0,4).map((s,i)=>({from:s.label,to:stages[i+1].label,eligible:1,visits:i?0:1,users:i?0:1,rate:i?0:1,list_key:'chain:drop:'+i})),chain={stages,drops,pending:1,dimensions:{source:[{value:'<source>',stages,drops}]},quality:{detail_events:2,versioned_detail_events:0,missing_visit_context:1,missing_session:1,manual_requests:0,requests_missing_visit:0,trade_events:0,trades_missing_visit:0},definition:'口径'}
 const html=productChainMarkup(ctx,{value_diagnostics:{product_chain:chain}})
 expect(html).toContain('先核对产品版本与采集');expect(html).toContain('采集待核对');expect(html).toContain('仍在观察');expect(html).toContain('data-op-key="chain:drop:0"');expect(html).toContain('生成固定人群任务');expect(html).toContain('&lt;source>');expect(html).not.toContain('<source>')
 })
 it('renders nothing for older cached results',()=>{expect(productChainMarkup({},{})).toBe('')})
})
import {conversionTimelineDetails} from '../../pages/observedDrill.js'
it('shows analysis and trade identities and outcomes in drilldown timelines',()=>{
 const esc=v=>String(v).replaceAll('<','&lt;'),analysis=conversionTimelineDetails({event_name:'analysis_request_finished',properties:{analysis_request_id:'<request>',token_visit_id:'visit',outcome:'empty',duration_ms:0,origin_view_state:'left'}},esc),trade=conversionTimelineDetails({event_name:'trade_succeeded',properties:{trade_attempt_id:'attempt',trade_id:'order'}},esc)
 expect(analysis).toContain('分析尝试：&lt;request>');expect(analysis).toContain('空结果');expect(analysis).not.toContain('0 ms');expect(analysis).toContain('已离开');expect(trade).toContain('交易尝试：attempt');expect(trade).toContain('订单：order')
})

it('shows database source and links unknown users without declaring no transactions',()=>{
 const ctx={esc:String,fmt:String,table:(heads,rows)=>heads.join('|')+'\n'+rows.map(r=>r.join('|')).join('\n')}
 const chain={pending:0,stages:[],dimensions:{},drops:[{from:'分析成功',to:'提交交易',eligible:0,visits:0,users:0,list_key:'drop',unknown:2,unknown_users:1,unknown_list_key:'unknown',rate:null}],quality:{detail_events:1,versioned_detail_events:1,manual_requests:1,trade_source:'trading_transaction',trade_query_error:'交易事实查询失败，结果未知',trade_unknown_visits:2},definition:'业务口径'}
 const html=productChainMarkup(ctx,{value_diagnostics:{product_chain:chain}})
 expect(html).toContain('trading_transaction');expect(html).toContain('交易事实查询失败，结果未知');expect(html).toContain('data-op-key="unknown"');expect(html).toContain('未知不表示没有交易')
})
