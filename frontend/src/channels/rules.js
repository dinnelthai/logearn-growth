export const FIELDS=['utm_source','utm_medium','utm_campaign','utm_content','partner_id','placement_id'];
export const UNKNOWN_CHANNEL=Object.freeze({id:'unknown',name:'未知渠道',conditions:{},priority:2147483647,enabled:true,version:1,updated_at:null,system:true});
export const defaultChannels=()=>[
 ['x_official','X 官方',{utm_source:'x',utm_medium:'owned_social'}],
 ['community','社群推荐',{utm_medium:'community'}],
 ['binance_official','币安广场官方',{utm_source:'binance_square',utm_medium:'owned_social'}],
 ['kol','KOL 推荐',{utm_medium:'kol'}],
 ['referral','用户邀请',{utm_medium:'referral'}]
].map(([id,name,conditions],i)=>({id,name,conditions,priority:(i+1)*10,enabled:true,version:1,updated_at:null}));
export function validateChannel(rule,others=[]){
 if(rule.id==='unknown'||rule.name?.trim()==='未知渠道')return '未知渠道为系统兜底渠道，不能修改';
 if(!rule.name?.trim())return '请填写渠道名称';
 if(!Number.isInteger(rule.priority)||rule.priority<0)return '优先级必须为非负整数，数字越小越优先';
 if(!FIELDS.some(k=>rule.conditions?.[k]?.trim()))return '至少填写一个匹配条件';
 if(others.some(r=>r.id!==rule.id&&r.name===rule.name.trim()))return '渠道名称已存在';
 return null;
}
export function matchChannel(fields,rules){return [...rules].filter(r=>r.enabled&&r.id!==UNKNOWN_CHANNEL.id).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).find(r=>FIELDS.every(k=>!r.conditions[k]||fields[k]===r.conditions[k]))??UNKNOWN_CHANNEL;}
export function overlaps(a,b){return FIELDS.every(k=>!a.conditions[k]||!b.conditions[k]||a.conditions[k]===b.conditions[k]);}
// 已归因访问直接读取保存的渠道快照，不随当前规则变化。
export function attributeVisit(fields,rules,previous=null){if(previous)return previous;const r=matchChannel(fields,rules);return {channel_id:r.id,channel_version:r.version,channel_name:r.name,source_fields:{...fields}};}
