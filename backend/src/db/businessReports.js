const {randomUUID}=require('node:crypto');
function createStore(db){
  function get(id,ownerId){
    const r=db.prepare('SELECT * FROM business_analysis_reports WHERE id=? AND owner_id=?').get(id,ownerId);
    return r?{id:r.id,title:r.title,createdAt:r.created_at,...JSON.parse(r.report_json)}:null;
  }
  function save(ownerId,title,report){
    const id=randomUUID(),createdAt=Date.now();
    db.prepare('INSERT INTO business_analysis_reports(id,owner_id,title,report_json,created_at) VALUES(?,?,?,?,?)').run(id,ownerId,title,JSON.stringify(report),createdAt);
    return {id,title,createdAt,...report};
  }
  function list(ownerId){return db.prepare('SELECT id,title,created_at FROM business_analysis_reports WHERE owner_id=? ORDER BY created_at DESC LIMIT 30').all(ownerId);}
  function actions(reportId,ownerId){return db.prepare('SELECT * FROM business_analysis_actions WHERE report_id=? AND owner_id=? ORDER BY created_at DESC').all(reportId,ownerId).map(r=>({...r,review:r.review_json?JSON.parse(r.review_json):null,review_json:undefined}));}
  function getAction(id,ownerId){return db.prepare('SELECT * FROM business_analysis_actions WHERE id=? AND owner_id=?').get(id,ownerId)||null;}
  function saveAction(report,ownerId,input){
    const candidate=report.candidates.find(c=>c.id===input.candidateId);
    if(!candidate)throw Object.assign(Error('事项不属于该报告'),{status:400});
    const now=Date.now(),id=randomUUID();
    db.prepare(`INSERT INTO business_analysis_actions(id,report_id,owner_id,candidate_id,title,priority,status,note,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'pending',?,?,?)`).run(id,report.id,ownerId,candidate.id,input.title,input.priority||candidate.priority,input.note||'',now,now);
    return getAction(id,ownerId);
  }
  function updateAction(id,ownerId,updates){
    const existing=getAction(id,ownerId);if(!existing)return null;
    const executedAt=updates.status==='executed'?(updates.executedAt??existing.executed_at??Date.now()):null;
    db.prepare(`UPDATE business_analysis_actions SET status=?,note=?,executed_at=?,review_json=NULL,updated_at=? WHERE id=? AND owner_id=?`)
      .run(updates.status,updates.note,executedAt,Date.now(),id,ownerId);
    return getAction(id,ownerId);
  }
  function saveReview(id,ownerId,review,expectedAction){
    const result=db.prepare(`UPDATE business_analysis_actions SET review_json=?,updated_at=? WHERE id=? AND owner_id=? AND updated_at=? AND note=? AND executed_at=? AND status='executed'`)
      .run(JSON.stringify(review),Date.now(),id,ownerId,expectedAction.updated_at,expectedAction.note,expectedAction.executed_at);
    if(!result.changes)throw Object.assign(Error('行动已被修改，请重新复盘'),{status:409});
    return getAction(id,ownerId);
  }
  function history(ownerId,source){
    return db.prepare(`SELECT a.title,a.priority,a.status,a.note,a.executed_at,a.review_json,r.title AS report_title,r.report_json
      FROM business_analysis_actions a JOIN business_analysis_reports r ON r.id=a.report_id
      WHERE a.owner_id=? AND r.owner_id=? ORDER BY a.updated_at DESC LIMIT 100`).all(ownerId,ownerId)
      .filter(row=>{const scope=JSON.parse(row.report_json).business.scope.source;return source==='all'||scope==='all'||scope===source;})
      .slice(0,30).map(({report_json,review_json,...row})=>({...row,scope:JSON.parse(report_json).business.scope,
        review:review_json?((r)=>({periods:r.periods,metricChanges:r.metricChanges,conclusion:r.conclusion,warnings:r.warnings,snapshot:r.snapshot}))(JSON.parse(review_json)):null}));
  }
  return {get,save,list,history,actions,getAction,saveAction,updateAction,saveReview};
}
module.exports={createStore};
