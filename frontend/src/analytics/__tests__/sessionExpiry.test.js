import {test,expect,vi,afterEach} from 'vitest'
import {notifyExpiredSession} from '../../auth/authClient.js'

afterEach(()=>vi.unstubAllGlobals())

test('only an authenticated 401 opens the login-expired notice',()=>{
  const dispatch=vi.fn()
  vi.stubGlobal('dispatchEvent',dispatch)
  vi.stubGlobal('CustomEvent',class {constructor(type){this.type=type}})
  vi.stubGlobal('localStorage',{getItem:key=>key==='logearn.auth.token'?'present':null})

  notifyExpiredSession({status:403})
  notifyExpiredSession({status:500})
  expect(dispatch).not.toHaveBeenCalled()
  notifyExpiredSession({status:401})
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(dispatch.mock.calls[0][0].type).toBe('logearn:session-expired')
})

test('an anonymous or storage-blocked browser receives no misleading expiry notice',()=>{
  const dispatch=vi.fn()
  vi.stubGlobal('dispatchEvent',dispatch)
  vi.stubGlobal('CustomEvent',class {constructor(type){this.type=type}})
  vi.stubGlobal('localStorage',{getItem:()=>null})
  expect(()=>notifyExpiredSession({status:401})).not.toThrow()
  expect(dispatch).not.toHaveBeenCalled()
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked')}})
  expect(()=>notifyExpiredSession({status:401})).not.toThrow()
  expect(dispatch).not.toHaveBeenCalled()
})
