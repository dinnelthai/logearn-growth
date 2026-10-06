import {describe,it,expect} from 'vitest';
import {defaultChannels,matchChannel,attributeVisit,overlaps,validateChannel} from './rules.js';
describe('渠道归因规则',()=>{
 it('平台和推广方式同时匹配，优先级确定唯一渠道',()=>{const rules=defaultChannels();expect(matchChannel({utm_source:'x',utm_medium:'kol'},rules).id).toBe('kol');rules.push({id:'special',name:'指定KOL',conditions:{utm_medium:'kol',partner_id:'kol_001'},priority:0,enabled:true,version:1});expect(matchChannel({utm_source:'x',utm_medium:'kol',partner_id:'kol_001'},rules).id).toBe('special');});
 it('停用影响新访问，历史快照保留',()=>{const rules=defaultChannels(),fields={utm_medium:'community'},old=attributeVisit(fields,rules);rules.find(r=>r.id==='community').enabled=false;expect(attributeVisit(fields,rules).channel_id).toBe('unknown');expect(attributeVisit(fields,rules,old)).toBe(old);});
 it('缺少参数和没有匹配均归入未知渠道',()=>{expect(matchChannel({},defaultChannels()).id).toBe('unknown');expect(attributeVisit({utm_source:'other'},defaultChannels()).channel_name).toBe('未知渠道');expect(validateChannel({id:'unknown',name:'未知渠道',priority:0,conditions:{utm_source:'x'}})).toBeTruthy();});
 it('识别重叠且拒绝空条件',()=>{const rules=defaultChannels();expect(overlaps(rules[3],{conditions:{utm_source:'x'}})).toBe(true);expect(validateChannel({name:'全部',priority:0,conditions:{}})).toBeTruthy();});
});
