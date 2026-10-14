export const TASKS=[
 {id:'diagnosis',title:'业务用户未使用诊断',question:'有价值线索、近期未观测分析或策略，哪些仍在访问或交易？',seed:'segments',filters:{task:'value_unobserved'},steps:[['segments','圈选用户'],['paths','定位行为卡点'],['funnel','核对转化损失'],['trade-monitor','排查交易问题'],['retention','观察回访']]},
 {id:'channels',title:'渠道用户质量',question:'哪个来源带来的用户会分析、交易并持续使用？',seed:'channels',steps:[['channels','比较来源'],['funnel','分析激活'],['segments','查看业务价值'],['retention','观察回访']]},
 {id:'points',title:'积分与签到效果',question:'奖励参与者是否也使用核心功能？',seed:'segments',filters:{points:'recent'},steps:[['segments','圈选积分参与者'],['paths','查看实际使用'],['funnel','核对核心转化'],['trade-monitor','查看交易结果'],['retention','观察回访']]},
 {id:'referral',title:'推荐增长质量',question:'谁带来的用户质量高，能否继续推荐？',seed:'referral',steps:[['referral','选择被邀请用户'],['segments','查看用户质量'],['paths','查看使用路径'],['trade-monitor','查看交易结果'],['retention','观察回访']]}
]
export function createTask(template,meta){if(!template||!meta.snapshot_id||!Number.isFinite(Date.parse(meta.as_of)))throw Error('任务数据快照无效');const end=Date.parse(meta.as_of)+1,start=Math.floor((end+25200000)/86400000)*86400000-25200000-6*86400000;return {id:'task_'+Date.now().toString(36),template:template.id,title:template.title,start,end,snapshotId:meta.snapshot_id,asOf:Date.parse(meta.as_of),createdAt:Date.now(),visited:[],completed:[],note:''}}
export function taskConfig(c,task,audience){if(!task)return c;return {...c,start:task.start,end:task.end,snapshotId:task.snapshotId,taskLocked:true,range:Math.ceil((task.end-task.start)/86400000),period:'task',audienceIds:audience?.ids??null,cohortId:null}}
export function savedTaskRecord(task,audience){return {...task,audience:audience?{title:audience.title,count:audience.ids.length}:null,scope:'任务记录，不包含用户明细；重新分析需新建快照'}}
