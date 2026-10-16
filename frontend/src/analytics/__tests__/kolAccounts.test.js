import {test,expect} from 'vitest'
import {kolAccountIds,kolProfileBody} from '../kolAccounts.js'
test('multi-account profile submissions retain every account, deduplicate pasted IDs and omit the legacy single field',()=>{
 const value=kolProfileBody({name:'KOL',account_id:'1',account_ids:'user:1\n2，1; 3',user_ids:'4\n5'})
 expect(value.account_ids).toEqual(['1','2','3']);expect(value).not.toHaveProperty('account_id');expect(value.user_ids).toBe('4\n5')
 expect(kolProfileBody({account_ids:[],account_id:'1'}).account_ids).toEqual([])
 expect(kolAccountIds({account_id:'8'})).toEqual(['8'])
 expect(kolAccountIds({account_ids:['1','2','2'],account_id:'1'})).toEqual(['1','2'])
})
