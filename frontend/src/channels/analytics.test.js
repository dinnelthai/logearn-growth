import {it,expect} from 'vitest';
import {computeChannels} from './analytics.js';
const options={facts:{records:[{user_id:'a',channel_id:'unknown',first_visit_at:'2026-10-01T01:00:00Z',payments:[]}]},rules:[{id:'unknown',name:'未知渠道'}],users:[{id:'user:a',events:[{type:'login',t:Date.parse('2026-10-01T01:01:00Z')},{type:'token',t:Date.parse('2026-10-01T01:02:00Z')},{type:'chip',t:Date.parse('2026-10-01T01:03:00Z')}]}],trades:null,startAt:Date.parse('2026-10-01T00:00:00Z'),endAt:Date.parse('2026-10-02T00:00:00Z'),asOf:Date.parse('2026-10-02T00:00:00Z')};
it('严格从记录计算未知渠道与漏斗，未成熟留存不补数',()=>{const r=computeChannels(options);expect(r.total.visits).toBe(1);expect(r.total.chip).toBe(1);expect(r.total.eligible).toBe(0);expect(r.total.volume).toBeNull();expect(r.groups[0].analysis).toBe(1)});
it('没有渠道记录则不展示；筛选不制造数据',()=>{expect(computeChannels({...options,facts:null})).toBeNull();expect(computeChannels({...options,channel:'missing'}).total.visits).toBe(0)});
