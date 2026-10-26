import {test,expect,vi} from 'vitest'
vi.mock('../../api/drill.js',()=>({fetchDrillUsers:vi.fn(),fetchUserTimeline:vi.fn()}))
import {fetchDrillUsers} from '../../api/drill.js'
import {weeklyCoreMarkup,bindWeeklyCore} from '../../pages/weeklyCore.js'
const ctx={esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmt:String,drawer:{openRemote:vi.fn()}}
const end=Date.parse('2026-10-24T00:00:00+07:00'),m={available:true,users:34,previous_users:38,retained:28,entered:6,lost:10,near_users:19,delta:-4,start:end-7*86400000,end,previous_start:end-14*86400000,source:'all',snapshot_id:'fixed',goal:{users:200,progress:.17,due_date:'2026-11-30'},distribution:[{days:4,users:5}],definition:'limited'}
test('card names metric, shows target and complete-week boundary, never replaces missing data with zero',()=>{
 const html=weeklyCoreMarkup(ctx,m);expect(html).toContain('周核心分析用户数');expect(html).toContain('17.0%');expect(html).toContain('11月底目标：200');expect(html).toContain('不含进行中的今天');expect(html).toContain('进入核心不等于新注册')
 expect(weeklyCoreMarkup(ctx,null)).toContain('未包含周核心指标');expect(weeklyCoreMarkup(ctx,{available:false,error:'<offline>'})).toContain('&lt;offline>')
 const filtered=weeklyCoreMarkup(ctx,{...m,source:'x',goal:{...m.goal,progress:null}});expect(filtered).toContain('200人目标按全平台衡量');expect(filtered).not.toContain('<progress')
})
test('drill retains exact core list, source, selected complete week and snapshot',()=>{
 const button={dataset:{weeklyCoreGroup:'near'}};bindWeeklyCore(ctx,{querySelectorAll:()=>[button]},m);button.onclick();const d=ctx.drawer.openRemote.mock.calls.at(-1)[0];d.fetchPage({offset:1,limit:2,q:'abc'});expect(fetchDrillUsers).toHaveBeenCalledWith({kind:'weekly_core',params:{end,source:'all',snapshot_id:'fixed',group:'near'},offset:1,limit:2,q:'abc'})
 const cell=d.renderRow({id:'<user>',source:'x',analysis_days:3,previous_analysis_days:4})[0];expect(cell).toContain('data-user="&lt;user>"');expect(cell).not.toContain('<user>')
})
test('core drawer exposes cross-module selection with authoritative group rather than current page rows',()=>{
 const button={dataset:{weeklyCoreGroup:'core'}};bindWeeklyCore(ctx,{querySelectorAll:()=>[button]},m);button.onclick()
 expect(ctx.drawer.openRemote.mock.calls.at(-1)[0].selection).toEqual({kind:'weekly_core',params:{end,source:'all',snapshot_id:'fixed',group:'core'}})
})
