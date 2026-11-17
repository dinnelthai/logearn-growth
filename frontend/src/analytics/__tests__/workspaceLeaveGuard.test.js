import {test,expect,vi} from 'vitest'
import {hasUnsavedPageChanges,confirmWorkspaceLeave} from '../../workspaceLeaveGuard.js'

test('navigation within the same page does not discard or prompt about draft edits',()=>{
 const page={hasPendingChanges:vi.fn(()=>true)}
 const confirm=vi.fn(()=>false)
 expect(hasUnsavedPageChanges(page,'crm','crm')).toBe(false)
 expect(confirmWorkspaceLeave(page,'crm','crm',confirm)).toBe(true)
 expect(confirm).not.toHaveBeenCalled()
})

test('a changed destination requires explicit confirmation before leaving unsaved edits',()=>{
 const page={hasPendingChanges:()=>true}
 const reject=vi.fn(()=>false)
 expect(confirmWorkspaceLeave(page,'crm','activities',reject)).toBe(false)
 expect(reject).toHaveBeenCalledOnce()
 expect(confirmWorkspaceLeave(page,'crm','activities',()=>true)).toBe(true)
 expect(confirmWorkspaceLeave(page,'crm','activities')).toBe(false)
})

test('no edits means ordinary navigation proceeds without a prompt',()=>{
 const confirm=vi.fn(()=>false)
 expect(confirmWorkspaceLeave({hasPendingChanges:()=>false},'workbench','crm',confirm)).toBe(true)
 expect(confirmWorkspaceLeave(null,'home','workbench',confirm)).toBe(true)
 expect(confirm).not.toHaveBeenCalled()
})

test('an unexpected draft-inspection failure fails closed rather than losing changes',()=>{
 const broken={hasPendingChanges:()=>{throw Error('detached form')}}
 expect(hasUnsavedPageChanges(broken,'activities','crm')).toBe(true)
 expect(confirmWorkspaceLeave(broken,'activities','crm',()=>false)).toBe(false)
})
