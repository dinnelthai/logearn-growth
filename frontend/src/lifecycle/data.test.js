import {it,expect} from 'vitest'
import {defaultRules} from './rules.js'
import {normalizeLifecycleFacts,lifecycleRequests} from './data.js'
it('没有服务端预览也能读取原始规则及发送记录',()=>{expect(normalizeLifecycleFacts({rules:defaultRules(),deliveries:[],deliveries_complete:true}).deliveries).toEqual([])})
it('记录不完整或时间无效不能解除发送限制',()=>{expect(()=>normalizeLifecycleFacts({rules:defaultRules(),deliveries:[]})).toThrow();expect(()=>normalizeLifecycleFacts({rules:defaultRules(),deliveries_complete:true,deliveries:[{user_id:'a',sent_at:'bad',status:'sent'}]})).toThrow()})
it('只提交 Dashboard 判定可触达的用户及运行上下文',()=>{expect(lifecycleRequests([{u:{id:'user:abc'},eligible:true,rule_id:'view_signal',channel:'telegram',strategy_run_id:'run1',result_id:'res1'},{u:{id:'user:no'},eligible:false}])).toEqual([{user_id:'abc',rule_id:'view_signal',channel:'telegram',strategy_run_id:'run1',result_id:'res1'}])})
