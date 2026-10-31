'use strict';
const DAY=86400000;
const safeJson=value=>{
 if(!value)return null;
 if(typeof value==='object')return value;
 try{return JSON.parse(value)}catch{return null}
};
const text=(value,max=160)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function dateInZone(ms,zone){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
 const values=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return values.year+'-'+values.month+'-'+values.day;
}
function createOperationsTimeline({
 db=require('../../../db/connection'),
 kolOperations=require('../../growth/kolOperations').createKolOperations({sqlite:db}),
 xMonitor=require('../../../services/xContentMonitor').monitor,
 gscService=require('../../growth/gscService').createGscService(),
 summarizeGscWindow=require('../../growth/gscService').summarizeGscWindow,
 specialistStore=require('../../growth/specialistStore').createSpecialistStore(),
 clock=Date.now
}={}){
 async function collect({start,end,source='all',limit=60}={},context={}){
  const ownerId=String(context.ownerId??context.userId??context.user_id??'');
  if(!ownerId)throw Object.assign(Error('运营时间线需要用户身份'),{status:401});
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end-start>31*DAY||end>clock())
   throw Object.assign(Error('运营时间线只支持最近31天内的有效时间范围'),{status:400});
  if(source!=='all')throw Object.assign(Error('运营时间线当前仅支持全来源范围'),{status:400});
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Object.assign(Error('运营时间线条数无效'),{status:400});
  const startIso=new Date(start).toISOString(),endIso=new Date(end).toISOString();
  const humanOperations=[],channelObservations=[],aiActions=[],coverage={};
  const status=count=>count?'available':'empty';
  const read=async(key,fn)=>{
   try{return await fn()}
   catch(error){coverage[key]={status:'unavailable',count:null,reason:'来源读取失败'};return null}
  };

  await read('growthActivities',async()=>{
   const rows=db.prepare(`SELECT id,name,start_at,cutoff_at,goal,target_metric,target_value,
    schedule_state,schedule_error,archived_at,settled_at,parent_id
    FROM growth_activities WHERE owner_id=? AND start_at<? AND cutoff_at>=?
     AND id NOT IN(SELECT child_id FROM growth_activity_merged_batches WHERE owner_id=?)
    ORDER BY start_at DESC,id LIMIT ?`).all(ownerId,end,start,ownerId,limit);
   const ids=rows.map(r=>r.id),placeholders=ids.map(()=>'?').join(',');
   const links=ids.length?db.prepare(
    'SELECT l.activity_id,k.name FROM crm_activity_links l JOIN crm_kols k ON k.id=l.kol_id AND k.owner_id=? WHERE l.activity_id IN ('+placeholders+') ORDER BY k.name'
   ).all(ownerId,...ids):[];
   const byActivity=new Map();
   for(const link of links){if(!byActivity.has(link.activity_id))byActivity.set(link.activity_id,[]);byActivity.get(link.activity_id).push(text(link.name,80))}
   const aggregate=(sql,...args)=>ids.length?db.prepare(sql.replaceAll('__IDS__',placeholders)).all(...args,...ids):[];
   const members=aggregate('SELECT activity_id,COUNT(*) AS count FROM growth_activity_members WHERE activity_id IN (__IDS__) GROUP BY activity_id',...[]);
   const planned=aggregate('SELECT activity_id,COUNT(*) AS count FROM growth_activity_planned_members WHERE activity_id IN (__IDS__) GROUP BY activity_id',...[]);
   const assignments=aggregate('SELECT x.activity_id,x.group_key,COUNT(*) AS count FROM growth_activity_assignments x JOIN growth_activities a ON a.id=x.activity_id WHERE a.owner_id=? AND x.assigned_at>=? AND x.assigned_at<? AND x.activity_id IN (__IDS__) GROUP BY x.activity_id,x.group_key',ownerId,start,end);
   const deliveries=aggregate('SELECT e.activity_id,e.kind,e.channel,COUNT(*) AS count,MIN(e.occurred_at) AS first_at,MAX(e.occurred_at) AS last_at FROM growth_activity_delivery_evidence e JOIN growth_activities a ON a.id=e.activity_id WHERE a.owner_id=? AND e.occurred_at>=? AND e.occurred_at<? AND e.activity_id IN (__IDS__) GROUP BY e.activity_id,e.kind,e.channel',ownerId,start,end);
   const scheduleChanges=aggregate('SELECT h.activity_id,h.action,COUNT(*) AS count,MIN(h.created_at) AS first_at,MAX(h.created_at) AS last_at FROM growth_activity_schedule_history h JOIN growth_activities a ON a.id=h.activity_id WHERE a.owner_id=? AND h.created_at>=? AND h.created_at<? AND h.activity_id IN (__IDS__) GROUP BY h.activity_id,h.action',ownerId,start,end);
   const group=(values,key)=>{const map=new Map();for(const item of values){if(!map.has(item.activity_id))map.set(item.activity_id,[]);map.get(item.activity_id).push(key(item))}return map};
   const memberCounts=new Map(members.map(x=>[x.activity_id,x.count]));
   const plannedCounts=new Map(planned.map(x=>[x.activity_id,x.count]));
   const assignmentByActivity=group(assignments,x=>({group:text(x.group_key,20),count:x.count}));
   const deliveryByActivity=group(deliveries,x=>({kind:text(x.kind,24),channel:text(x.channel,32),count:x.count,firstAt:x.first_at,lastAt:x.last_at}));
   const scheduleByActivity=group(scheduleChanges,x=>({action:text(x.action,32),count:x.count,firstAt:x.first_at,lastAt:x.last_at}));
   for(const r of rows)humanOperations.push({
    id:'activity:'+r.id,kind:'growth_activity',layer:'human_operation',source:'growth_activities',
    title:text(r.name,120),channel:'owned_activity',startAt:r.start_at,endAt:r.cutoff_at,
    status:r.archived_at?'archived':r.schedule_state||'active',goal:text(r.goal,80),
    targetMetric:r.target_metric||null,targetValue:r.target_value??null,
    linkedKols:byActivity.get(r.id)||[],settledAt:r.settled_at??null,
    memberCount:memberCounts.get(r.id)??0,plannedMemberCount:plannedCounts.get(r.id)??0,
    assignments:assignmentByActivity.get(r.id)||[],
    deliveryEvidence:deliveryByActivity.get(r.id)||[],
    scheduleChanges:scheduleByActivity.get(r.id)||[],
    scheduleIssue:!!r.schedule_error
   });
   coverage.growthActivities={status:status(rows.length),count:rows.length,limit,truncated:rows.length===limit,ownerScoped:true};
   return rows;
  });

  await read('kolCollaborations',async()=>{
   const rows=db.prepare(`SELECT c.id,c.kol_id,c.name,c.start_at,c.end_at,c.goal,c.deliverables,
    c.assignee,c.status,c.created_at,c.updated_at,k.name AS kol_name
    FROM crm_collaborations c JOIN crm_kols k ON k.id=c.kol_id AND k.owner_id=c.owner_id
    WHERE c.owner_id=? AND c.start_at<? AND c.end_at>=?
    ORDER BY c.updated_at DESC,c.id LIMIT ?`).all(ownerId,end,start,limit);
   const ids=rows.map(r=>r.id),links=ids.length?db.prepare(
    'SELECT collaboration_id,activity_id FROM crm_collaboration_activities WHERE collaboration_id IN ('+ids.map(()=>'?').join(',')+')'
   ).all(...ids):[];
   const linked=new Map();
   for(const row of links){if(!linked.has(row.collaboration_id))linked.set(row.collaboration_id,[]);linked.get(row.collaboration_id).push(row.activity_id)}
   const finance=await kolOperations.collaborations(ownerId,{limit:50}).catch(()=>[]);
   const financeById=new Map(finance.map(row=>[row.collaborationId,row]));
   for(const r of rows){
    const f=financeById.get(r.id);
    humanOperations.push({
     id:'kol-collaboration:'+r.id,kind:'kol_collaboration',layer:'human_operation',
     source:'crm_collaborations',title:text(r.name,120),channel:'KOL',
     kol:text(r.kol_name,80),startAt:r.start_at,endAt:r.end_at,
     status:r.status,goal:text(r.goal,240),deliverables:text(r.deliverables,240),
     assignee:text(r.assignee,80),linkedActivityIds:(linked.get(r.id)||[]).slice(0,8),
     financeSource:f?.financeSource||'manual-ledger',
     costTotals:(f?.costTotals||[]).slice(0,4),
     revenueTotals:(f?.revenueTotals||[]).slice(0,4)
    });
   }
   coverage.kolCollaborations={status:status(rows.length),count:rows.length,limit,truncated:rows.length===limit,ownerScoped:true};
   return rows;
  });

  await read('contentRecords',async()=>{
   const rows=db.prepare(`SELECT id,platform,title,topic,published_at,created_at,
    impressions,likes,comments,shares,audience_fit,actionability
    FROM content_growth_items WHERE owner_id=?
     AND julianday(COALESCE(NULLIF(published_at,''),created_at))>=julianday(?)
     AND julianday(COALESCE(NULLIF(published_at,''),created_at))<julianday(?)
    ORDER BY julianday(COALESCE(NULLIF(published_at,''),created_at)) DESC,id LIMIT ?`
   ).all(ownerId,startIso,endIso,limit);
   for(const r of rows)humanOperations.push({
    id:'content:'+r.id,kind:'content_record',layer:'human_operation',
    source:'content_growth_items',title:text(r.title,120),channel:text(r.platform,40),
    topic:text(r.topic,80),eventAt:r.published_at?Date.parse(r.published_at):Date.parse(r.created_at),
    metrics:{impressions:r.impressions??null,likes:r.likes??null,
     comments:r.comments??null,shares:r.shares??null},
    evaluation:{audienceFit:r.audience_fit??null,actionability:r.actionability??null},
    collection:'manual'
   });
   coverage.contentRecords={status:status(rows.length),count:rows.length,limit,truncated:rows.length===limit,ownerScoped:true,collection:'manual'};
   return rows;
  });

  await read('operationTasks',async()=>{
   const rows=db.prepare(`SELECT id,title,assignee,priority,status,due_at,created_at,updated_at,completed_at
    FROM operation_tasks WHERE owner_id=? AND (
     (created_at>=? AND created_at<?) OR (updated_at>=? AND updated_at<?) OR
     (due_at>=? AND due_at<?))
    ORDER BY updated_at DESC,id LIMIT ?`).all(ownerId,start,end,start,end,start,end,limit);
   for(const r of rows)humanOperations.push({
    id:'operation-task:'+r.id,kind:'operation_task',layer:'human_managed_task',
    source:'operation_tasks',title:text(r.title,120),assignee:text(r.assignee,80),
    priority:r.priority,status:r.status,dueAt:r.due_at??null,
    createdAt:r.created_at,updatedAt:r.updated_at,completedAt:r.completed_at??null
   });
   coverage.operationTasks={status:status(rows.length),count:rows.length,limit,truncated:rows.length===limit,ownerScoped:true};
   return rows;
  });

  await read('xOfficial',async()=>{
   const overview=xMonitor.overview(ownerId);
   let count=0,truncated=false;
   for(const account of overview.accounts||[]){
    const oldest=Date.parse((account.posts||[]).at(-1)?.published_at||'');
    if((account.posts||[]).length===20&&Number.isFinite(oldest)&&start<oldest)truncated=true;
    const posts=(account.posts||[]).filter(p=>{
     const at=Date.parse(p.published_at);return Number.isFinite(at)&&at>=start&&at<end;
    });
    const measured=posts.filter(p=>Number(p.impressions)>0&&
     [p.likes,p.replies,p.reposts].every(v=>v!=null));
    const views=measured.reduce((n,p)=>n+Number(p.impressions),0);
    const interactions=measured.reduce((n,p)=>n+Number(p.likes)+Number(p.replies)+Number(p.reposts)+(Number(p.quotes)||0),0);
    count+=posts.length;
    channelObservations.push({
     id:'x-account:'+account.id,kind:'x_official_account',layer:'channel_observation',
     source:overview.source||'twitterapi.io',title:text(account.label,80)+' X 账号',
     observedAt:account.lastSynced??null,
     metrics:{samplePosts:posts.length,measuredPosts:measured.length,
      impressions:views||null,engagementRate:views?Math.round(interactions/views*10000)/100:null},
     samplePosts:posts.slice(0,10).map(p=>({
      publishedAt:p.published_at,observedAt:p.observed_at??null,
      impressions:p.impressions??null,likes:p.likes??null,
      replies:p.replies??null,reposts:p.reposts??null,quotes:p.quotes??null
     })),
     coverage:{samplePosts:posts.length,accountPostCap:20,
      attribution:overview.attribution||'not-verified'}
    });
   }
   coverage.xOfficial={status:count?'available':overview.configured?'empty':'not_configured',
    count,limitPerAccount:20,truncated,source:overview.source||'twitterapi.io',limit:'最多最近20条/账号；公开指标非转化归因'};
   return overview;
  });

  await read('searchConsole',async()=>{
   const selection=await gscService.setting(ownerId);
   if(!selection?.site_url){coverage.searchConsole={status:'not_configured',count:0,timezone:'America/Los_Angeles'};return null}
   const ptStart=dateInZone(start,'America/Los_Angeles'),ptEnd=dateInZone(end-1,'America/Los_Angeles');
   const record=await gscService.latestOverlapping(ownerId,{startDate:ptStart,endDate:ptEnd});
   if(!record){coverage.searchConsole={status:'empty',count:0,siteUrl:selection.site_url,timezone:'America/Los_Angeles'};return null}
   const result=summarizeGscWindow(record,{startDate:ptStart,endDate:ptEnd});
   channelObservations.push({
    id:'gsc:'+record.id,kind:'search_console',layer:'channel_observation',
    source:'gsc-api',title:'Search Console · '+text(record.site_url,100),
    startDate:result.startDate,endDate:result.endDate,
    observedAt:result.syncedAt??record.fetched_at??null,
    metrics:result.metrics,coverage:result.coverage,
    dateTimezone:'America/Los_Angeles',
    warnings:(result.warnings||[]).slice(0,4)
   });
   coverage.searchConsole={status:result.coverage?.status||'partial',count:1,
    siteUrl:record.site_url,timezone:'America/Los_Angeles',
    periodMatched:result.coverage?.periodMatched===true};
   return result;
  });

  await read('kolObservations',async()=>{
   const snapshots=await kolOperations.list(ownerId,{limit:12});
   const selected=snapshots.filter(r=>Number(r.start_at)<end&&Number(r.end_at)>=start).slice(0,8);
   for(const record of selected){
    const evidence=safeJson(record.evidence)||{},rows=Array.isArray(evidence.rows)?evidence.rows:[];
    const observedUsers=rows.reduce((n,r)=>n+(Number.isFinite(Number(r.observedUsers))?Number(r.observedUsers):0),0);
    const analysisEvents=rows.reduce((n,r)=>n+(Number.isFinite(Number(r.analysisEvents))?Number(r.analysisEvents):0),0);
    channelObservations.push({
     id:'kol-observation:'+record.id,kind:'kol_period_observation',layer:'channel_observation',
     source:'kol-crm-observed-behavior',title:'KOL 观察周期',
     startAt:Number(record.start_at),endAt:Number(record.end_at),
     observedAt:Date.parse(record.source_watermark)||record.captured_at||null,
     metrics:{profiles:rows.length,observedUsers,analysisEvents},
     coverage:safeJson(record.coverage)||{},scope:evidence.scope||'tagged',
     attribution:'observational-not-causal'
    });
   }
   coverage.kolObservations={status:status(selected.length),count:selected.length,limit:12,truncated:snapshots.length===12,ownerScoped:true};
   return selected;
  });

  await read('aiReportActions',async()=>{
   const rows=db.prepare(`SELECT a.id,a.title,a.priority,a.status,a.executed_at,a.created_at,a.updated_at,
    a.review_json,r.title AS report_title
    FROM business_analysis_actions a JOIN business_analysis_reports r ON r.id=a.report_id
    WHERE a.owner_id=? AND r.owner_id=? AND (
     (a.created_at>=? AND a.created_at<?) OR
     (a.updated_at>=? AND a.updated_at<?) OR
     (a.executed_at>=? AND a.executed_at<?))
    ORDER BY a.updated_at DESC,a.id LIMIT ?`).all(ownerId,ownerId,start,end,start,end,start,end,limit);
   for(const r of rows){
    const review=safeJson(r.review_json);
    aiActions.push({
     id:'ai-report-action:'+r.id,kind:'ai_report_action',layer:'ai_suggestion_or_review',
     source:'business_analysis_actions',title:text(r.title,120),reportTitle:text(r.report_title,100),
     priority:r.priority,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,
     executedAt:r.executed_at??null,review:review?{
      conclusion:text(review.conclusion,180),warningCount:Array.isArray(review.warnings)?review.warnings.length:0
     }:null
    });
   }
   coverage.aiReportActions={status:status(rows.length),count:rows.length,limit,truncated:rows.length===limit,ownerScoped:true};
   return rows;
  });

  await read('specialistSignals',async()=>{
   const rows=await specialistStore.list(ownerId,{limit:50,includeClosed:true});
   const matching=rows.filter(r=>Number(r.first_seen_at)<end&&Number(r.last_seen_at)>=start);
   const selected=matching.slice(0,limit);
   for(const r of selected)aiActions.push({
    id:'ai-signal:'+r.id,kind:'ai_specialist_signal',layer:'ai_suggestion_or_review',
    source:'ai_growth_specialist_tasks',title:text(r.title,120),priority:r.priority,
    status:r.status,firstSeenAt:r.first_seen_at,lastSeenAt:r.last_seen_at,
    occurrences:r.occurrences??1,sourceKind:r.kind
   });
   coverage.specialistSignals={status:status(selected.length),count:selected.length,limit,truncated:selected.length===limit||rows.length===50,ownerScoped:true};
   return selected;
  });

  const sort=(a,b)=>(Number(b.eventAt??b.updatedAt??b.observedAt??b.lastSeenAt??b.startAt??b.createdAt??0)-
    Number(a.eventAt??a.updatedAt??a.observedAt??a.lastSeenAt??a.startAt??a.createdAt??0));
  const timeline=[...humanOperations,...channelObservations,...aiActions].sort(sort).slice(0,limit);
  const warnings=[
   '人工活动、手工内容、用户管理任务与 AI 建议/复盘分层保存；不能把 AI 建议当作已执行活动',
   'X 指标是第三方公开观察且最多读取每账号最近20条，不代表曝光增量或注册转化',
   'Search Console 日期按太平洋时间（PT）；与曼谷业务时间并不完全对齐',
   'KOL 观察与人工账本不证明增量因果；多币种成本/收入不得合并',
   '活动、社群与培训仅在现有 growth_activities / operation_tasks 等记录中可见；没有专门平台连接时不代表不存在活动',
   '内容增长记录是人工登记，不是平台完整采集'
  ];
  const limited=Object.entries(coverage).filter(([,value])=>value?.truncated===true).map(([key])=>key);
  if(limited.length)warnings.push('以下来源达到本次读取上限，返回的是有界样本而非完整清单：'+limited.join(', '));
  return {
   period:{start,end,timezone:'Asia/Bangkok',endExclusive:true},
   asOf:clock(),humanOperations:humanOperations.slice(0,limit),
   channelObservations:channelObservations.slice(0,limit),
   aiActions:aiActions.slice(0,limit),timeline,coverage,warnings
  };
 }
 return {collect};
}
function defaultOperationsTimeline(){
 const service=createOperationsTimeline();
 return service.collect;
}
module.exports={createOperationsTimeline,defaultOperationsTimeline,dateInZone};
