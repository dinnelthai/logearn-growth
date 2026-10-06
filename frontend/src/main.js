import * as FloatingUIDOM from "@floating-ui/dom";
import { BarChart, FunnelChart, LineChart, SankeyChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import "./styles.css";

echarts.use([
  AriaComponent,
  BarChart,
  FunnelChart,
  GridComponent,
  LegendComponent,
  LineChart,
  SankeyChart,
  SVGRenderer,
  TooltipComponent,
]);

globalThis.FloatingUIDOM = FloatingUIDOM;
globalThis.echarts = echarts;

async function start() {
  const status=document.getElementById('as-data-status')
  const badge=document.getElementById('as-data-badge')
  if (!globalThis.LOGEARN_ANALYTICS_DATA && import.meta.env.VITE_ANALYTICS_DATA_SOURCE === 'api') {
    badge.textContent='真实数据 · 加载中'
    document.querySelectorAll('#la-studio button, #la-studio select').forEach(b=>b.disabled=true)
    try {
      const {fetchAllAnalyticsData}=await import('./api/analytics.js')
      const {normalizeApiResponse}=await import('./analytics/normalize.js')
      const asOf=Date.now(),startAt=asOf-90*86400000
      const raw=await fetchAllAnalyticsData(startAt,asOf)
      const data=normalizeApiResponse({...raw,startAt,asOf,timezone:'Asia/Bangkok'})
      data.userReferrals=raw.userReferrals??null
      globalThis.LOGEARN_ANALYTICS_DATA=data
    } catch {
      badge.textContent='真实数据 · 请求失败'
      status.textContent='数据请求失败，请检查接口配置后重试。'
      const retry=document.createElement('button')
      retry.className='a-button';retry.textContent='重新加载';retry.onclick=()=>location.reload()
      status.append(' ',retry)
      document.getElementById('as-output').textContent='分析结果暂不可用。'
      document.getElementById('as-dirty').textContent='数据尚未加载'
      return
    }
    document.querySelectorAll('#la-studio button, #la-studio select').forEach(b=>b.disabled=false)
  }
  if(!globalThis.LOGEARN_ANALYTICS_DATA){
    const {datasetFromJson}=await import('./analytics/jsonDataset.js')
    globalThis.LOGEARN_ANALYTICS_DATA=datasetFromJson()
  }
  await import('./dashboard.js')
  await import('./tooltips.js')
}
start().catch(()=>{
  document.getElementById('as-data-status').textContent='页面初始化失败，请刷新重试。'
})
