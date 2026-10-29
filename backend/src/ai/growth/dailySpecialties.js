'use strict';
function availableDailySpecialties(db,ownerId){
 if(!db?.prepare||typeof ownerId!=='string'||!ownerId)throw Error('专项信号上下文无效');
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 const out=[];
 if(tables.has('content_growth_items')&&db.prepare("PRAGMA table_info(content_growth_items)").all().some(c=>c.name==='owner_id')){
  if(db.prepare('SELECT 1 FROM content_growth_items WHERE owner_id=? LIMIT 1').get(ownerId))out.push('content-growth');
 }
 if(tables.has('x_content_posts')&&
  db.prepare('SELECT 1 FROM x_content_posts WHERE owner_id=? LIMIT 1').get(ownerId)&&
  !out.includes('content-growth'))out.push('content-growth');
 if(tables.has('x_follower_audit')){
  if(db.prepare('SELECT 1 FROM x_follower_audit WHERE owner_id=? LIMIT 1').get(ownerId))out.push('follower-quality');
 }
 return out;
}
module.exports={availableDailySpecialties};
