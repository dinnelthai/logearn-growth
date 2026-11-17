import {test,expect} from 'vitest'
import {collectWorkspaceViews,searchWorkspaceViews} from '../../workspaceQuickJump.js'

const views=[
  {mode:'home',label:'平台概况',section:'总览'},
  {mode:'growth-insights',label:'增长诊断',section:'总览'},
  {mode:'ai-analysis',label:'AI 增长分析',section:'AI Growth Agent'},
  {mode:'crm',label:'KOL CRM',section:'渠道与 SEO'},
  {mode:'funnel',label:'转化漏斗',section:'增长分析'}
]

test('desktop quick switch finds a page by its own label or parent section',()=>{
  expect(searchWorkspaceViews(views,'漏斗').map(v=>v.mode)).toEqual(['funnel'])
  expect(searchWorkspaceViews(views,'SEO').map(v=>v.mode)).toEqual(['crm'])
  expect(searchWorkspaceViews(views,'ai 增长').map(v=>v.mode)).toEqual(['ai-analysis'])
  expect(searchWorkspaceViews(views,'KOL CRM').map(v=>v.mode)).toEqual(['crm'])
})

test('empty query follows actual navigation order; no fuzzy result invents pages',()=>{
  expect(searchWorkspaceViews(views,'',3).map(v=>v.mode)).toEqual(['home','growth-insights','ai-analysis'])
  expect(searchWorkspaceViews(views,'not-a-real-page')).toEqual([])
  expect(searchWorkspaceViews(views,'',0)).toEqual([])
})

test('page index only contains existing, enabled sidebar destinations',()=>{
  const button=(mode,label,section,{disabled=false}={})=>({
    dataset:{mode},disabled,textContent:label,
    closest:()=>({querySelector:()=>({textContent:section})}),
    getAttribute:()=>null
  })
  const root={
    querySelectorAll:()=>[
      button('home','平台概况','总览'),
      button('crm','KOL CRM','渠道与 SEO'),
      button('crm','Duplicate','渠道与 SEO'),
      button('disabled','不可用','系统',{disabled:true})
    ]
  }
  expect(collectWorkspaceViews(root)).toEqual([
    {mode:'home',label:'平台概况',section:'总览'},
    {mode:'crm',label:'KOL CRM',section:'渠道与 SEO'}
  ])
})
