import {test,expect,vi,beforeEach} from 'vitest'

vi.mock('../../api/metrics.js',()=>({
  fetchChannelMetrics:vi.fn(),
  fetchPathsMetrics:vi.fn(),
  fetchTradeMetrics:vi.fn()
}))
vi.mock('../../pages/chartLifecycle.js',()=>({
  createChartLifecycle:vi.fn(()=>({dispose:vi.fn(),attach:vi.fn()}))
}))
import {fetchChannelMetrics,fetchPathsMetrics,fetchTradeMetrics} from '../../api/metrics.js'
import {createChartLifecycle} from '../../pages/chartLifecycle.js'
import {createChannelsAggPage} from '../../pages/channelsAgg.js'
import {createPathsAggPage} from '../../pages/pathsAgg.js'
import {createTradeMonitorAggPage} from '../../pages/tradeMonitorAgg.js'


function fixture(){
 const nodes=new Map()
 const $=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{
   innerHTML:'',onclick:null,querySelector:()=>null,querySelectorAll:()=>[],isConnected:true
  })
  return nodes.get(selector)
 }
 return {
  nodes,
  ctx:{
   $,clear:vi.fn(),esc:String,fmt:String,pct:()=>'',table:()=>'',stat:()=>'',date:String,
   day:86400000,names:{},root:{},themeMedia:{},
   dataStore:{meta:{storage:'rollup'},channelRules:[]}
  }
 }
}

beforeEach(()=>vi.clearAllMocks())

test('old legacy channel response cannot overwrite a page after disposal',async()=>{
 let resolve
 fetchChannelMetrics.mockImplementation(()=>new Promise(done=>{resolve=done}))
 const t=fixture(),page=createChannelsAggPage(t.ctx)
 const pending=page.draw({start:0,end:86400000,source:'all'})
 expect(fetchChannelMetrics).toHaveBeenCalledOnce()
 page.dispose()
 t.ctx.$('#as-output').innerHTML='OTHER WORKSPACE'
 resolve({total:{},groups:[],days:[]})
 await pending
 expect(t.ctx.$('#as-output').innerHTML).toBe('OTHER WORKSPACE')
})

test('refreshing legacy path or trade metrics releases the previous chart lifecycle immediately',async()=>{
 let resolvePath,resolveTrade
 fetchPathsMetrics.mockImplementation(()=>new Promise(done=>{resolvePath=done}))
 fetchTradeMetrics.mockImplementation(()=>new Promise(done=>{resolveTrade=done}))
 const p=fixture(),t=fixture()
 const paths=createPathsAggPage(p.ctx)
 const trade=createTradeMonitorAggPage(t.ctx)
 const pathLifecycle=createChartLifecycle.mock.results[0].value
 const tradeLifecycle=createChartLifecycle.mock.results[1].value
 const a=paths.draw({start:0,end:86400000})
 const b=trade.draw({start:0,end:86400000})
 expect(pathLifecycle.dispose).toHaveBeenCalledOnce()
 expect(tradeLifecycle.dispose).toHaveBeenCalledOnce()
 paths.dispose()
 trade.dispose()
 p.ctx.$('#as-output').innerHTML='OTHER PAGE'
 t.ctx.$('#as-output').innerHTML='OTHER PAGE'
 resolvePath({paths:[],nodes:[],links:[],drill:{}})
 resolveTrade({total:{},days:[],byChain:[]})
 await Promise.all([a,b])
 expect(p.ctx.$('#as-output').innerHTML).toBe('OTHER PAGE')
 expect(t.ctx.$('#as-output').innerHTML).toBe('OTHER PAGE')
 expect(pathLifecycle.dispose).toHaveBeenCalledTimes(2)
 expect(tradeLifecycle.dispose).toHaveBeenCalledTimes(2)
})
