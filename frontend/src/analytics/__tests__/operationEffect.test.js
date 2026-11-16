import {test,expect} from 'vitest'
import {renderOperationEffect} from '../../pages/operationEffect.js'
const helpers={esc:String,fmt:String,table:(headers,rows)=>JSON.stringify({headers,rows}),observedTime:String}
test('waits for execution instead of claiming a zero result',()=>{
 const html=renderOperationEffect({pending:true,awaiting_execution:true},helpers)
 expect(html).toContain('尚未登记运营执行')
 expect(html).not.toContain('0%')
})
test('compares fixed roster in matched windows and qualifies trade records',()=>{
 const html=renderOperationEffect({
 pending:false,start:200,end:300,before_period:{start:100,end:200},window_days:7,complete:false,
 comparison:{before:{total:{users:10,analysis_users:2,analysis_events:3,trade_users:0,transactions:0,volume_usd:0}},after:{total:{users:10,analysis_users:5,analysis_events:9,trade_users:1,transactions:2,volume_usd:20}}},
 movement:{analysis_ids:['user:1'],trade_ids:['user:2']},errors:{}},helpers)
 expect(html).toContain('20.0% → 50.0%')
 expect(html).toContain('0.0% → 10.0%')
 expect(html).toContain('前期未观测、本期有交易记录')
 expect(html).toContain('交易记录须进一步核实实际成交')
})
