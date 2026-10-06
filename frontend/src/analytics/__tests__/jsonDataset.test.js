import {it,expect} from 'vitest'
import {datasetFromJson} from '../jsonDataset.js'
const manifest={as_of:'2026-10-06T06:00:00Z',start_at:'2026-09-21T17:00:00Z',timezone:'Asia/Bangkok'}
it('仅使用JSON用户事件和截止时间，不补生成数据',()=>{const data=datasetFromJson({users:{users:[{user_id:'a'}]},events:{events:[]},manifest});expect(data.users).toHaveLength(1);expect(data.users[0].events).toEqual([]);expect(data.meta.asOf).toBe(Date.parse(manifest.as_of));expect(data.trades).toBeNull();expect(data.channelRules).toBeNull();expect(data.lifecycleRules).toBeNull()})
it('缺少核心JSON明确失败，不回退内置Mock',()=>{expect(()=>datasetFromJson({manifest})).toThrow()})
it('渠道和生命周期配置完整保留JSON内容',()=>{const rules=[{id:'custom',name:'自定义'}],data=datasetFromJson({users:{users:[]},events:{events:[]},manifest,channels:{rules},'lifecycle-rules':{rules}});expect(data.channelRules).toBe(rules);expect(data.lifecycleRules).toBe(rules)})

it('删除全部行为后所有事件驱动人数归零，不自动补数',()=>{const users={users:[{user_id:'a',first_source:'X',created_at:'2026-09-22T01:00:00Z'}]},event={event_id:'e1',event_name:'chip_analysis_viewed',occurred_at:'2026-10-05T01:00:00Z',user_id:'a',properties:{}};
const full=datasetFromJson({users,events:{events:[event]},manifest}),empty=datasetFromJson({users,events:{events:[]},manifest});expect(full.users[0].events.filter(e=>e.type==='chip')).toHaveLength(1);expect(empty.users[0].events).toHaveLength(0);expect(empty.users).toHaveLength(1);});
it('未提供的数据配置与统计保持缺失，不注入默认渠道或生命周期',()=>{const data=datasetFromJson({users:{users:[]},events:{events:[]},manifest});expect(data.referrals).toBeNull();expect(data.trades).toBeNull();expect(data.channelRules).toBeNull();expect(data.lifecycleRules).toBeNull();expect(data.users).toEqual([])});
