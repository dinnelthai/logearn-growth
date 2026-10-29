import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/aiAnalysis.js',()=>({
 getSeoImports:vi.fn(),importSeoSnapshot:vi.fn(),previewSeoSnapshot:vi.fn(),
 getGscConnection:vi.fn(),saveGscSite:vi.fn(),syncGscPerformance:vi.fn(),
 getGscPerformance:vi.fn(),getGscSitemaps:vi.fn(),inspectGscUrl:vi.fn(),
 getGrowthInbox:vi.fn(),getGrowthAlerts:vi.fn(),getGrowthMonitorControl:vi.fn(),
 setGrowthMonitorControl:vi.fn(),scanGrowthAlerts:vi.fn(),changeGrowthAlert:vi.fn(),
 getGrowthBudget:vi.fn(),getGrowthInvestigations:vi.fn(),decideGrowthInvestigation:vi.fn(),
 getGrowthNotifications:vi.fn(),markGrowthNotificationRead:vi.fn(),
 getGrowthInvestigationTimeline:vi.fn()
}))
import * as api from '../../api/aiAnalysis.js'
import {createSeoPage} from '../../pages/seoPage.js'
import {createGrowthMonitorPage} from '../../pages/growthMonitorPage.js'

function setup(create){
 const nodes={'[data-seo-refresh]':{onclick:null},'[data-monitor-refresh]':{onclick:null}}
 const host={
  innerHTML:'',
  querySelector(selector){return nodes[selector]||null},
  querySelectorAll(){return []}
 }
 const navigate=vi.fn()
 const page=create({$:()=>host,esc:v=>String(v??''),clear:vi.fn(),navigate})
 return {page,host,nodes,navigate}
}
beforeEach(()=>{
 vi.resetAllMocks()
 api.getSeoImports.mockResolvedValue({imports:[]})
 api.getGscConnection.mockResolvedValue({configured:false,sites:[],reason:'尚未配置 Google API'})
 api.getGscPerformance.mockResolvedValue({available:false})
 api.getGrowthInbox.mockResolvedValue({tasks:[],counts:{total:0},warnings:[]})
 api.getGrowthAlerts.mockResolvedValue({alerts:[]})
 api.getGrowthMonitorControl.mockResolvedValue({allowed:false,enabled:false})
 api.getGrowthInvestigations.mockResolvedValue({proposals:[]})
 api.getGrowthNotifications.mockResolvedValue({notifications:[]})
 api.getGrowthBudget.mockResolvedValue({limit:0,reservedCalls:0,remainingCalls:0})
})
test('SEO page exclusively loads existing GSC and snapshot APIs without creating model jobs',async()=>{
 const t=setup(createSeoPage)
 await t.page.draw()
 expect(t.host.innerHTML).toContain('SEO 分析')
 expect(t.host.innerHTML).toContain('data-gsc-sync-form')
 expect(t.host.innerHTML).toContain('data-gsc-inspect-form')
 expect(t.host.innerHTML).toContain('data-seo-import-form')
 expect(api.getGscConnection).toHaveBeenCalledOnce()
 expect(api.getGscPerformance).toHaveBeenCalledOnce()
 expect(api.getGrowthInvestigations).not.toHaveBeenCalled()
 t.page.dispose()
})
test('SEO site and final metrics reflect the same real API status as the old page',async()=>{
 api.getGscConnection.mockResolvedValue({configured:true,selectedSite:'sc-domain:logearn.com',mode:'service-account',sites:[{siteUrl:'sc-domain:logearn.com',permissionLevel:'siteOwner'}]})
 api.getGscPerformance.mockResolvedValue({available:true,report:{siteUrl:'sc-domain:logearn.com',startDate:'2026-10-01',endDate:'2026-10-22',metrics:{clicks:18,impressions:500,ctr:0.036,position:8.5},daily:[],queries:[{query:'logearn',clicks:9,impressions:150,ctr:0.06,position:5.2}],pages:[]}})
 const t=setup(createSeoPage)
 await t.page.draw()
 expect(t.host.innerHTML).toContain('已连接 · 站点已选定')
 expect(t.host.innerHTML).toContain('logearn')
 expect(t.host.innerHTML).toContain('3.60%')
 t.page.dispose()
})
test('monitoring and investigations are separate from AI reporting and do not create jobs on page read',async()=>{
 const t=setup(createGrowthMonitorPage)
 await t.page.draw()
 expect(t.host.innerHTML).toContain('异常监控与调查')
 expect(t.host.innerHTML).toContain('增长异常自动监控')
 expect(t.host.innerHTML).toContain('待审批异常调查')
 expect(api.getGrowthMonitorControl).toHaveBeenCalledOnce()
 expect(api.getGscConnection).not.toHaveBeenCalled()
 t.page.dispose()
})
test('monitor action requires actual operator interaction and preserves server versions',async()=>{
 const toggle={disabled:false,isConnected:true}
 const t=setup(createGrowthMonitorPage)
 t.nodes['[data-monitor-toggle]']=toggle
 api.getGrowthMonitorControl.mockResolvedValue({allowed:true,enabled:false,version:7,workerOnline:false})
 api.setGrowthMonitorControl.mockResolvedValue({enabled:true,workerOnline:false})
 await t.page.draw()
 expect(api.setGrowthMonitorControl).not.toHaveBeenCalled()
 await toggle.onclick()
 expect(api.setGrowthMonitorControl).toHaveBeenCalledWith(true,7)
 t.page.dispose()
})
