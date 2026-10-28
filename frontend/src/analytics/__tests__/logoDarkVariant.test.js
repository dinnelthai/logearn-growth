import {test,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')

test('sidebar uses the official LogEarn dark wordmark with no white tile',()=>{
 const index=read('../../../index.html')
 const workspace=read('../../workspace.css')
 const official=read('../../../public/brand/logearn-official.svg')
 const dark=read('../../../public/brand/logearn-official-dark.svg')
 const pathGeometry=svg=>[...svg.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1])
 expect(index).toContain('src="/brand/logearn-official-dark.svg"')
 expect(workspace).toContain('.sidebar-brand img { display:block')
 expect(workspace).toContain('background:transparent; border-radius:0; padding:0')
 expect(workspace).not.toContain('.sidebar-brand img { background:#fff')
 expect(pathGeometry(dark)).toEqual(pathGeometry(official))
 expect(dark).toContain('fill="#F1F5F9"')
 expect(dark).not.toContain('fill="#282828"')
 expect(dark.match(/#26CC36/g)?.length).toBe(official.match(/#26CC36/g)?.length)
})
