import {it,expect} from 'vitest'
import {normalizeLanguage} from '../language.js'
import {normalizeApiResponse} from '../normalize.js'
it('groups declared Chinese and English variants and leaves unknown distinct',()=>{
 expect(normalizeLanguage('zh-CN')).toBe('zh')
 expect(normalizeLanguage('zh_TW')).toBe('zh')
 expect(normalizeLanguage('en-US')).toBe('en')
 expect(normalizeLanguage('th')).toBeNull()
 expect(normalizeLanguage(undefined)).toBeNull()
 const r=normalizeApiResponse({events:[],users:[{user_id:'1',preferred_language:'en-GB'}],referrals:[],startAt:0,asOf:1000})
 expect(r.users[0].preferred_language).toBe('en')
})
