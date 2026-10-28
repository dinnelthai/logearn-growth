import {test,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {navigationMode} from '../../navigation.js'
const html=readFileSync(new URL('../../../index.html',import.meta.url),'utf8')
test('sidebar keeps core modes and has an accessible collapse control',()=>{
 for(const mode of ['home','business-analysis','ai-analysis','growth-agent-control','workbench','segments','channels','crm','funnel','paths','retention','trade-monitor'])expect(html).toContain(`data-mode="${mode}"`)
 expect(html).toContain('data-sidebar-toggle');expect(html).toContain('aria-expanded="true"')
 expect(navigationMode('growth-agent-control')).toBe('growth-agent-control')
})

test('filter toggle, main content and mobile overlay exist without changing deep-link modes',()=>{
 expect(html).toContain('id="as-filter-toggle"')
 expect(html).toContain('aria-controls="as-config"')
 expect(html).toContain('id="as-main-content" role="main"')
 expect(html).toContain('data-sidebar-backdrop')
 expect(html).toContain('class="workspace-skip"')
 expect(navigationMode('login-conversion')).toBe('funnel')
 expect(navigationMode('invite-conversion')).toBe('funnel')
})

test('nested navigation groups appear immediately after the matching primary entry',()=>{
 const nav=html.match(/<nav class="a-topnav"[^>]*>[\\s\\S]*?<\\/nav>/)?.[0]||'';
 expect(nav).toContain('id="as-section-nav"');
 expect(html).not.toContain('sidebar-caption">当前模块');
 for(const key of ['overview','analysis','agent','operations','users','channels','settings']){
   expect(nav).toMatch(new RegExp('data-section="'+key+'"[\\s\\S]*?data-navigation-section="'+key+'"'));
 }
 expect(nav).toContain('class="nav-children"');
 expect(nav).toContain('nav-icon');
});
