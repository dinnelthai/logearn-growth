import {test,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {navigationMode} from '../../navigation.js'
const html=readFileSync(new URL('../../../index.html',import.meta.url),'utf8')
test('sidebar keeps core modes and has an accessible collapse control',()=>{
 for(const mode of ['home','business-analysis','ai-analysis','growth-agent-control','workbench','segments','channels','crm','funnel','paths','retention','trade-monitor'])expect(html).toContain(`data-mode="${mode}"`)
 expect(html).toContain('data-sidebar-toggle');expect(html).toContain('aria-expanded="true"')
 expect(navigationMode('growth-agent-control')).toBe('growth-agent-control')
})
