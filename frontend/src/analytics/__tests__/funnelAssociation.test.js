import {it,expect} from 'vitest'
import {computeFunnel} from '../funnel.js'
import {groupFunnels} from '../comparisonViews.js'
const DAY=86400000,base=Date.parse('2026-10-01T00:00:00Z')
const e=(type,offset,fields={})=>({type,t:base+offset,...fields})
const opts={steps:['token_click','token','chip'],startAt:base,endAt:base+DAY,asOf:base+2*DAY,conversionWindowMs:DAY,association:'token_visit'}
const u=events=>({id:'u',events})
it('rejects cross visits/tokens/chains while user-order mode retains sequential matching',()=>{
 const users=[u([e('token_click',1,{token_visit_id:'v1',token_address:'A',chain:'1'}),e('token',2,{token_visit_id:'v2',token_address:'B',chain:'1'}),e('chip',3,{token_visit_id:'v2',token_address:'B',chain:'1'})])]
 expect(computeFunnel(users,opts).total_converted).toBe(0)
 expect(computeFunnel(users,{...opts,association:'user'}).total_converted).toBe(1)
 for(const fields of [{token_address:'B',chain:'1'},{token_address:'A',chain:'56'}])expect(computeFunnel([u([e('token_click',1,{token_visit_id:'v1',token_address:'A',chain:'1'}),e('token',2,{token_visit_id:'v1',...fields})])],opts).rows[0].times).toHaveLength(1)
})
it('does not replace the first missing start or reenter a later successfully instrumented visit',()=>{
 const users=[u([e('token_click',1),e('token_click',2,{token_visit_id:'later'}),e('token',3,{token_visit_id:'later'}),e('chip',4,{token_visit_id:'later'})])]
 const r=computeFunnel(users,opts);expect(r.total_entered).toBe(0);expect(r.quality.missingStartUserIds).toEqual(['u'])
 const later=computeFunnel([u([e('token_click',1,{token_visit_id:'first'}),...users[0].events.slice(1)])],opts)
 expect(later.rows).toHaveLength(1);expect(later.total_converted).toBe(0)
})
it('reports missing downstream IDs separately from confirmed loss',()=>{
 const r=computeFunnel([u([e('token_click',1,{token_visit_id:'v1'}),e('token',2)])],opts)
 expect(r.rows[0]).toMatchObject({dataIncomplete:true,pending:false});expect(r.steps[0].drop_off_users).toBe(0);expect(r.quality.incompleteUserIds).toEqual(['u'])
 const [g]=groupFunnels([{label:'A',people:[u([e('token_click',1,{token_visit_id:'v1'}),e('token',2)])]}],{...opts,preset:'token_visit'})
 expect(g.stages[0].lost).toEqual([]);expect(g.incomplete.map(x=>x.id)).toEqual(['u'])
})
it('matches one run and permits cross-period results only within window/asOf',()=>{
 const users=[u([e('ai',DAY-10,{strategy_run_id:'r1'}),e('strategy_result',DAY+1,{strategy_run_id:'r2'}),e('strategy_result',DAY+2,{strategy_run_id:'r1'}),e('signal_view',DAY+3,{strategy_run_id:'r2'}),e('signal_view',DAY+4,{strategy_run_id:'r1'})])]
 const options={...opts,steps:['ai','strategy_result','signal_view'],association:'strategy_run'}
 expect(computeFunnel(users,options).rows[0].times).toEqual([base+DAY-10,base+DAY+2,base+DAY+4])
 expect(computeFunnel(users,{...options,asOf:base+DAY+3}).total_converted).toBe(0)
 expect(computeFunnel(users,{...options,conversionWindowMs:5}).total_converted).toBe(0)
})
it('strict order rejects equal timestamps and sorting handles unsorted input',()=>{
 const fields={token_visit_id:'v'}
 expect(computeFunnel([u([e('chip',3,fields),e('token',2,fields),e('token_click',1,fields)])],opts).total_converted).toBe(1)
 expect(computeFunnel([u([e('token_click',1,fields),e('token',1,fields),e('chip',2,fields)])],opts).total_converted).toBe(0)
 expect(()=>computeFunnel([],{...opts,association:'invented'})).toThrow('association')
})

import {datasetFromJson} from '../jsonDataset.js'
import {validConfig,saveConfig,loadConfig} from '../configStorage.js'
it('existing JSON explicitly covers good, crossed and missing associations',()=>{
 const data=datasetFromJson(),users=data.users.filter(u=>u.id.startsWith('user:MOCK-FUNNEL-'))
 const options={startAt:Date.parse('2026-10-03T17:00:00Z'),endAt:Date.parse('2026-10-05T17:00:00Z'),asOf:data.meta.asOf}
 const visit=computeFunnel(users,{...options,steps:['token_click','token','chip'],association:'token_visit'})
 expect(visit.total_entered).toBe(3);expect(visit.total_converted).toBe(1)
 expect(visit.quality).toEqual({missingStartUserIds:['user:MOCK-FUNNEL-03'],incompleteUserIds:['user:MOCK-FUNNEL-04']})
 const run=computeFunnel(users,{...options,steps:['ai','strategy_result','signal_view'],association:'strategy_run'})
 expect(run.total_entered).toBe(2);expect(run.total_converted).toBe(1)
 const cfg={mode:'funnel',steps:['token_click','token','chip'],range:14,hours:24,source:'all',strategy:'all',initial:'chip',returning:'chip'}
 let saved;const storage={setItem:(k,v)=>{saved=v},getItem:()=>saved};saveConfig(storage,{...cfg,association:'token_visit'});expect(loadConfig(storage).association).toBe('token_visit');expect(validConfig({...cfg,association:'token_visit'})).toBe(true);expect(validConfig(cfg)).toBe(true);expect(validConfig({...cfg,association:'invented'})).toBe(false)
})
