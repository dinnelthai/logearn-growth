import {test,expect} from 'vitest'
import {renderOperationEffect} from '../../pages/operationEffect.js'
const helpers={esc:String,fmt:String,table:(headers,rows)=>JSON.stringify({headers,rows}),observedTime:String}
test('waits for execution instead of claiming a zero result',()=>{
 const html=renderOperationEffect({pending:true,awaiting_execution:true},helpers)
 expect(html).toContain('尚未确认运营执行')
 expect(html).not.toContain('0%')
})
test('renders legacy continuous observations without a comparison',()=>{
 const html=renderOperationEffect({legacy:true,start:1,end:2,performance:{total:{analysis_users:3,analysis_events:4,trade_users:1,transactions:2,volume_usd:5}},errors:{}},helpers)
 expect(html).toContain('持续观察')
 expect(html).toContain('最长最近 366 天')
 expect(html).not.toContain('前期未观测')
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

test('D7 reactivation is a separate drillable row, not D7 retention',()=>{
 const html=renderOperationEffect({pending:false,start:200,end:300,before_period:{start:100,end:200},window_days:7,complete:true,
 comparison:{before:{total:{users:10}},after:{total:{users:10}}},
 return_d7:{before_users:0,after_users:1},
 movement:{analysis_ids:[],trade_ids:[],return_d7_ids:['user:7']},errors:{}},helpers)
 expect(html).toContain('回流 D7（观测）')
 expect(html).toContain('data-op-movement="return_d7"')
 expect(html).toContain('不是D7留存')
})
test('unavailable D7 evidence displays unknown instead of zero',()=>{
 const html=renderOperationEffect({pending:false,start:200,end:300,before_period:{start:100,end:200},window_days:7,
 comparison:{before:{total:{users:10}},after:{total:{users:10}}},return_d7:null,
 movement:{analysis_ids:[],trade_ids:[],return_d7_ids:null},errors:{return_d7:'source unavailable'}},helpers)
 expect(html).toContain('source unavailable')
 expect(html).toContain('数据不足')
})
