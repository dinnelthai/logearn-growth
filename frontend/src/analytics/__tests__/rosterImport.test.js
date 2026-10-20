import {test,expect,vi} from 'vitest'
import {mountRosterImport} from '../../pages/rosterImport.js'
test('editing imported IDs invalidates an in-flight validation and requires another preview',async()=>{
 const nodes=new Map(),host={isConnected:true,querySelector:s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'132',textContent:'',disabled:false});return nodes.get(s)}},onValidated=vi.fn(),onChange=vi.fn();let finish
 mountRosterImport(host,{esc:String,fmt:String},{onChange,onValidated,validate:()=>new Promise(r=>finish=r)})
 const button=nodes.get('[data-roster-validate]'),pending=button.onclick({target:button}),input=nodes.get('[name=ids]');input.value='133';input.oninput();finish({matched:1,eligible:1,prior:0,duplicates:0,dirty:[],invalid:[],unmatched:[]});await pending
 expect(onChange).toHaveBeenCalledWith('133');expect(onValidated).toHaveBeenCalledExactlyOnceWith(null);expect(nodes.get('[data-roster-validation]').innerHTML).toBe('')
})
test('address import is available and preview escapes addresses while explaining ambiguous accounts',async()=>{
 const {rosterImportHTML,addressReportHTML}=await import('../../pages/rosterImport.js')
 expect(rosterImportHTML(String)).toContain('登录地址 / 平台地址')
 const html=addressReportHTML({esc:s=>String(s).replaceAll('<','&lt;'),fmt:String},{matched:1,users:1,unmatched:0,ambiguous:1,duplicates:0,invalid:['<invalid>'],records:[{address:'<address>',state:'matched',user_id:'123',sources:['login','platform']},{address:'conflict',state:'ambiguous',user_id:null,sources:[]}]})
 expect(html).toContain('123');expect(html).toContain('登录地址 / 平台地址');expect(html).toContain('对应多个账号，不纳入');expect(html).not.toContain('<address>');expect(html).toContain('&lt;invalid>')
})
test('resolved addresses populate IDs and editing addresses invalidates the saved roster preview',async()=>{
 const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',textContent:'',disabled:false,querySelector:node});return nodes.get(s)},host={isConnected:true,querySelector:node},onValidated=vi.fn()
 vi.stubGlobal('localStorage',{getItem:()=>null})
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({matched:1,users:1,unmatched:0,ambiguous:0,duplicates:0,invalid:[],user_ids:['123'],records:[{address:'0x'+'a'.repeat(40),state:'matched',user_id:'123',sources:['login']}]})})))
 try{
  mountRosterImport(host,{esc:String,fmt:String},{onValidated})
  node('[data-roster-mode]').value='replace'
  node('[data-roster-source]').onchange({target:{value:'address'}})
  node('[data-source-addresses]').value='0x'+'a'.repeat(40)
  const button=node('[data-resolve-addresses]');await button.onclick({target:button})
  expect(node('[name=ids]').value).toBe('123');expect(node('[data-address-results]').innerHTML).toContain('登录地址')
  node('[data-source-addresses]').oninput()
  expect(node('[name=ids]').value).toBe('');expect(onValidated).toHaveBeenLastCalledWith(null)
 }finally{vi.unstubAllGlobals()}
})
test('default paste resolves addresses before validating IDs and displays the mapping',async()=>{
 const address='FSBdJJ8xtfv7i6V99BafiucTW2Uyq89GX5Dx1g8dRzrm',nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',textContent:'',disabled:false});return nodes.get(s)},host={isConnected:true,querySelector:node},onChange=vi.fn(),onValidated=vi.fn(),result={matched:2,eligible:2,prior:0,duplicates:0,dirty:[],invalid:[],unmatched:[]},validate=vi.fn(async()=>result)
 vi.stubGlobal('localStorage',{getItem:()=>null});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({matched:1,users:1,unmatched:0,ambiguous:0,duplicates:0,invalid:[],user_ids:['123'],records:[{address,state:'matched',user_id:'123',sources:['login']}]})})))
 try{mountRosterImport(host,{esc:String,fmt:String},{onChange,onValidated,validate});node('[name=ids]').value=address+'\n456';const button=node('[data-roster-validate]');await button.onclick({target:button});expect(validate).toHaveBeenCalledWith('456\n123');expect(onChange).toHaveBeenLastCalledWith('456\n123');expect(onValidated).toHaveBeenLastCalledWith(result);expect(node('[data-roster-validation]').innerHTML).toContain(address);expect(node('[name=ids]').value).toBe('456\n123')}finally{vi.unstubAllGlobals()}
})
test('unmatched address stays editable and does not validate an empty roster',async()=>{
 const address='0x'+'a'.repeat(40),nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',textContent:'',disabled:false});return nodes.get(s)},host={isConnected:true,querySelector:node},validate=vi.fn(),onValidated=vi.fn()
 vi.stubGlobal('localStorage',{getItem:()=>null});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({matched:0,users:0,unmatched:1,ambiguous:0,duplicates:0,invalid:[],user_ids:[],records:[{address,state:'unmatched',user_id:null,sources:[]}]})})))
 try{mountRosterImport(host,{esc:String,fmt:String},{validate,onValidated});node('[name=ids]').value=address;const button=node('[data-roster-validate]');await button.onclick({target:button});expect(validate).not.toHaveBeenCalled();expect(onValidated).toHaveBeenLastCalledWith(null);expect(node('[name=ids]').value).toBe(address);expect(node('[data-roster-validation]').innerHTML).toContain('未找到账号')}finally{vi.unstubAllGlobals()}
})
test('mixed roster parsing recognizes EVM and Solana addresses and ignores CSV headers',async()=>{
 const {splitRosterInput}=await import('../../pages/rosterImport.js'),evm='0x'+'A'.repeat(40),sol='FSBdJJ8xtfv7i6V99BafiucTW2Uyq89GX5Dx1g8dRzrm'
 expect(splitRosterInput('user_id,address\n123,"'+evm+'"\n456 '+sol)).toEqual({ids:['123','456'],addresses:[evm,sol]})
})

test('append merges IDs, emails and wallets without losing existing users',async()=>{
 const {mergeRosterInput,splitRosterInput}=await import('../../pages/rosterImport.js'),evm='0x'+'a'.repeat(40)
 expect(mergeRosterInput('123\nTest@Example.com\n'+evm,'123 456 test@example.com '+evm.toUpperCase().replace('0X','0x'))).toBe('123\nTest@Example.com\n'+evm+'\n456')
 expect(splitRosterInput('email,用户ID\nTest@Example.com,123')).toEqual({ids:['123'],addresses:['Test@Example.com']})
 expect(()=>mergeRosterInput(Array.from({length:5000},(_,i)=>String(i)).join(' '),'5001')).toThrow('5000')
})
test('append button retains current roster and invalidates previous validation',()=>{
 const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',textContent:'',disabled:false});return nodes.get(s)},host={isConnected:true,querySelector:node},onChange=vi.fn(),onValidated=vi.fn()
 mountRosterImport(host,{esc:String,fmt:String},{onChange,onValidated});node('[name=ids]').value='123';node('[data-roster-additions]').value='123 test@example.com';node('[data-roster-append]').onclick()
 expect(node('[name=ids]').value).toBe('123\ntest@example.com');expect(onChange).toHaveBeenLastCalledWith('123\ntest@example.com');expect(onValidated).toHaveBeenLastCalledWith(null);expect(node('[data-roster-additions]').value).toBe('')
})
