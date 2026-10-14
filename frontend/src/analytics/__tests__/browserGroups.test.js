import {it,expect} from 'vitest'
import {browserGroups} from '../../pages/deviceDiagnostics.js'
it('groups by browser major version, includes unknown and deduplicates users',()=>{
 const a={id:'a',browser:'Chrome',version:'156.0.1',os:'Windows'}
 const groups=browserGroups([a,a,{id:'b',browser:'Chrome',version:'156.0.8',os:'macOS'},{id:'c',browser:'Chrome',version:'154.0',os:'Windows'},{id:'d'}])
 expect(groups.browser.map(g=>[g.label,g.rows.length])).toEqual([['Chrome 156',2],['Chrome 154',1],['未知',1]])
 expect(groups.os.find(g=>g.label==='Windows').rows).toHaveLength(2)
})
