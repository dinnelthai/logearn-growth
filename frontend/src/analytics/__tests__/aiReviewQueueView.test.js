import {test,expect} from 'vitest'
import {renderAIReviewQueue} from '../../pages/aiReviewQueueView.js'

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]))
const show=queue=>renderAIReviewQueue(queue,{esc})

test('only backend-ready suggestions with real IDs can launch a possibly paid review',()=>{
  const html=show({entries:[
    {suggestionId:'s-ready',analysisId:'a-1',title:'分析激活差异',status:'ready'},
    {suggestionId:'s-wait',analysisId:'a-2',title:'留存观察中',status:'waiting',
     earliestReviewAt:Date.parse('2026-10-30T00:00:00Z')},
    {title:'未知复盘状态',status:'unknown'},
    {suggestionId:null,title:'无 ID',status:'ready'}
  ]})
  expect(html).toContain('data-ready-review="s-ready"')
  expect(html.match(/data-ready-review=/g)).toHaveLength(1)
  expect(html).toContain('data-analysis="a-1"')
  expect(html).toContain('data-analysis="a-2"')
  expect(html).toContain('等待观察期和数据水位')
  expect(html).toContain('2026-10-30')
  expect(html).toContain('资格待核查')
  expect(html).toContain('可能产生费用')
})

test('queue failures never pretend that no review is pending',()=>{
  const html=show({error:'HTTP <503>',entries:[]})
  expect(html).toContain('role="alert"')
  expect(html).toContain('&lt;503&gt;')
  expect(html).not.toContain('暂无待复盘行动')
  expect(show({entries:[]})).toContain('暂无待复盘行动')
})

test('user-supplied content and malformed dates remain safe and factual',()=>{
  const html=show({entries:[{
    suggestionId:'<id>',title:'<img src=x onerror=alert(1)>',
    status:'waiting',earliestReviewAt:'not-a-date'
  }]})
  expect(html).toContain('&lt;img')
  expect(html).not.toContain('<img')
  expect(html).toContain('尚未确认')
  expect(html).not.toContain('data-ready-review')
})

test('empty review state remains compact and links to saved action suggestions',()=>{
  const html=show({entries:[]})
  expect(html).toContain('class="ai-review-empty"')
  expect(html).toContain('暂无待复盘行动')
  expect(html).toContain('href="#ai-report"')
  expect(html).not.toContain('data-ready-review')
})

test('review rows place readiness and owner-confirmed action together without nested cards',()=>{
  const html=show({entries:[
    {suggestionId:'ready-2',analysisId:'analysis-2',title:'核查首访分析路径',status:'ready'},
    {suggestionId:'waiting-2',analysisId:'analysis-3',title:'等待观察',status:'waiting',
      earliestReviewAt:Date.parse('2026-11-05T00:00:00Z')}
  ]})
  expect(html).toContain('ai-review-queue-body')
  expect(html).toContain('ai-review-queue-actions')
  expect(html).toContain('发起复盘 · 可能产生费用')
  expect(html).toContain('data-analysis="analysis-2"')
  expect(html.match(/data-ready-review=/g)).toHaveLength(1)
  expect(html).not.toContain('class="a-card')
})
