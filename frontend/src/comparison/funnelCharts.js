import {EVENT_LABELS} from '../analytics/events.js'
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
/** Each group uses an actual ECharts FunnelChart with values normalized to its entrants. */
export function mountFunnelCharts(host,groups,onDrill) {
 const charts=[],observers=[],media=matchMedia('(prefers-color-scheme: dark)'),painters=[]
 host.querySelectorAll('[data-funnel-chart]').forEach(target=>{
  const group=groups[+target.dataset.funnelChart]
  if(!group.entered){target.innerHTML='<p class="a-empty">无漏斗起点样本</p>';return}
  if(!globalThis.echarts){target.innerHTML='<p class="a-empty">漏斗图暂未加载，请查看下方明细。</p>';return}
  const chart=globalThis.echarts.init(target,null,{renderer:'svg'});charts.push(chart)
  const data=group.stages.map(stage=>({name:EVENT_LABELS[stage.key],value:stage.reached.length/group.entered*100,count:stage.reached.length}))
  const paint=()=>chart.setOption({animation:false,tooltip:{trigger:'item',confine:true,formatter:p=>`${esc(group.label)}<br>${esc(p.name)}<br>${p.data.count} 人 · ${p.value.toFixed(1)}%`},series:[{type:'funnel',name:group.label,left:'8%',right:'8%',top:12,bottom:20,min:0,max:100,minSize:'0%',maxSize:'100%',sort:'none',gap:5,funnelAlign:'center',label:{show:true,position:'inside',color:'#fff',fontSize:12,formatter:p=>`${p.name}\n${p.data.count} 人 · ${p.value.toFixed(1)}%`},labelLine:{show:false},itemStyle:{borderColor:media.matches?'#1b2028':'#fff',borderWidth:2},emphasis:{label:{fontWeight:'bold'}},data:data.map((d,i)=>({...d,itemStyle:{color:['#4f46e5','#0284c7','#059669'][i%3]}}))}]},true)
  paint();painters.push(paint);chart.on('click',p=>{const stage=group.stages[p.dataIndex];if(stage)onDrill(group.label+' · '+EVENT_LABELS[stage.key],stage.reached,'漏斗到达用户 · 相对起点归一化')})
  const observer=new ResizeObserver(()=>chart.resize());observer.observe(target);observers.push(observer)
  target.setAttribute('aria-label',`${group.label}漏斗：${data.map(d=>d.name+' '+d.count+'人 '+d.value.toFixed(1)+'%').join('，')}。点击步骤查看用户。`)
 })
 const onTheme=()=>painters.forEach(p=>p());media.addEventListener('change',onTheme)
 return ()=>{media.removeEventListener('change',onTheme);observers.forEach(o=>o.disconnect());charts.forEach(c=>c.dispose())}
}
