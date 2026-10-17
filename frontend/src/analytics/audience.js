/** Materialized audience: IDs are fixed for this session, conditions are descriptive. */
export const AUDIENCE_MODES = new Set(['login-conversion','invite-conversion','funnel','paths','retention','segments','channels','trade-monitor','referral'])
export function createAudience({title,description,rows,context,query=''}) {
 if(!Number.isFinite(context?.start)||!Number.isFinite(context?.end)||context.start>=context.end)throw Error('人群统计期无效')
 const ids=[...new Set(rows.map(row=>(row.u??row).id).filter(id=>typeof id==='string'&&id))]
 if(!ids.length)throw Error('没有可分析的用户')
 return Object.freeze({title,description,query,ids:Object.freeze(ids),start:context.start,end:context.end,origin:context.mode,source:context.source??'all'})
}
export function audienceUsers(users,audience,mode){
 if(!audience||!AUDIENCE_MODES.has(mode))return users
 const ids=new Set(audience.ids)
 return users.filter(u=>ids.has(u.id))
}
export function audiencePeriod(config,audience){
 if(!audience||!AUDIENCE_MODES.has(config.mode))return config
 return {
  ...config,
  start:audience.start,
  end:audience.end,
  range:Math.ceil((audience.end-audience.start)/86400000),
  period:'audience',
  audienceIds:audience.ids?[...audience.ids]:config.audienceIds??null,
  cohortId:audience.cohortId??config.cohortId??null,
  snapshotId:audience.snapshot_id??config.snapshotId,
  source:audience.source??config.source,
 }
}
