import {test,expect} from 'vitest'
import {renderDataTable} from '../../components/dataTable.js'

test('table renders a keyboard-scrollable region with column headers and interactive cells',()=>{
 const html=renderDataTable(['用户','分析次数'],[['<button data-drill="user1">user1</button>','12']])
 expect(html).toContain('role="region"')
 expect(html).toContain('tabindex="0"')
 expect(html).toContain('<th scope="col">用户</th>')
 expect(html).toContain('data-drill="user1"')
 expect(html).not.toContain('data-table-empty')
})

test('empty table explains missing rows instead of silently presenting a zero',()=>{
 const html=renderDataTable(['来源','有效分析'],[])
 expect(html).toContain('colspan="2"')
 expect(html).toContain('数据缺失不等于零')
 expect(html).not.toContain('<tbody></tbody>')
})
