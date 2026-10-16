import {test,expect,vi} from 'vitest'
import {mountRosterImport} from '../../pages/rosterImport.js'
test('editing imported IDs invalidates an in-flight validation and requires another preview',async()=>{
 const nodes=new Map(),host={isConnected:true,querySelector:s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'132',textContent:'',disabled:false});return nodes.get(s)}},onValidated=vi.fn(),onChange=vi.fn();let finish
 mountRosterImport(host,{esc:String,fmt:String},{onChange,onValidated,validate:()=>new Promise(r=>finish=r)})
 const button=nodes.get('[data-roster-validate]'),pending=button.onclick({target:button}),input=nodes.get('[name=ids]');input.value='133';input.oninput();finish({matched:1,eligible:1,prior:0,duplicates:0,dirty:[],invalid:[],unmatched:[]});await pending
 expect(onChange).toHaveBeenCalledWith('133');expect(onValidated).toHaveBeenCalledExactlyOnceWith(null);expect(nodes.get('[data-roster-validation]').innerHTML).toBe('')
})
