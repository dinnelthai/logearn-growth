import {it,expect} from 'vitest'
import {tagSelectionRequest,selectedTagAudience,renewedAudience} from '../audienceSelection.js'
const c={start:1,end:100,source:'all'},base={ids:['user:1','user:2'],title:'固定名单',source:'x',start:1,end:100,snapshot_id:'old'}
const value={ids:['user:1'],title:'活动A',description:'标签',start:1,end:100,snapshot_id:'old'}
it('replacing a tag starts again from the original base, including platform-wide scopes',()=>{
 const a=selectedTagAudience(value,base,['activity:A'],'all'),b=tagSelectionRequest(c,a,['activity:B'])
 expect(b.body.audience_ids).toEqual(base.ids);expect(b.body.source).toBe('x');expect(b.base).toBe(base)
 const platform=selectedTagAudience(value,null,['activity:A'],'all');expect(tagSelectionRequest(c,platform,['activity:B']).body.audience_ids).toBeNull()
})
it('explicit intersection uses the whole current list and preserves the condition source',()=>{
 const a=selectedTagAudience(value,base,['activity:A'],'all'),request=tagSelectionRequest(c,a,['activity:B'],'any',true)
 expect(request.body.audience_ids).toEqual(['user:1']);const b=selectedTagAudience({...value,title:'B'},request.base,['activity:B'],'any');expect(b.description).toContain('活动A')
})
it('renewal keeps IDs and period while changing snapshots for the audience and original base',()=>{
 const a=selectedTagAudience(value,base,['activity:A'],'all'),next=renewedAudience(a,{snapshot_id:'new',as_of:'2026-10-15T00:00:00Z'})
 expect(next.ids).toEqual(a.ids);expect(next.start).toBe(a.start);expect(next.end).toBe(a.end);expect(next.snapshot_id).toBe('new');expect(next.selection.base.snapshot_id).toBe('new');expect(a.snapshot_id).toBe('old')
 expect(()=>renewedAudience(a,{})).toThrow('快照无效')
})
it('an empty fixed audience remains empty after renewal',()=>{expect(renewedAudience({...value,ids:[]},{snapshot_id:'n',as_of:'2026-10-15T00:00:00Z'}).ids).toEqual([])})
