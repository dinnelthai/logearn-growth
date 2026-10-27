'use strict';
const {createHash}=require('node:crypto');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
function sourceChanges(db,ownerId,{now=Date.now()}={}){
 if(typeof ownerId!=='string'||!ownerId||!Number.isSafeInteger(now))throw Error('信号查询范围无效');
 const changes=[];
 // The absence of these optional tables is an unknown source, not a zero.
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 if(tables.has('content_growth_items')&&db.prepare("PRAGMA table_info(content_growth_items)").all().some(c=>c.name==='owner_id')){
  const row=db.prepare("SELECT COUNT(*) n,MAX(created_at) newest FROM content_growth_items WHERE owner_id=?").get(ownerId);
  if(row.n>0&&row.newest){
   const observed=Date.parse(row.newest);
   if(Number.isFinite(observed)&&observed<=now&&now-observed<=30*86400000)
    changes.push({id:'source-content-'+digest([ownerId,row.newest,row.n]),kind:'content',occurredAt:observed,validUntil:observed+30*86400000});
  }
 }
 if(tables.has('x_follower_progress')){
  for(const row of db.prepare('SELECT account,complete,state,updated_at FROM x_follower_progress WHERE owner_id=?').all(ownerId)){
   if(row.complete===1||!Number.isSafeInteger(row.updated_at)||row.updated_at>now||now-row.updated_at>30*86400000)continue;
   changes.push({id:'source-follower-'+digest([ownerId,row.account,row.state,row.updated_at]),
     kind:'audience',occurredAt:row.updated_at,validUntil:row.updated_at+30*86400000});
  }
 }
 return changes.slice(0,20);
}
module.exports={sourceChanges};
