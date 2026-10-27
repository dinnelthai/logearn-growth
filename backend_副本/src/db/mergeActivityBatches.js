// Preserve legacy child rows for recovery; member statistics now belong to the root activity.
function mergeActivityBatches(db){
 const children=db.prepare(`SELECT c.id,c.owner_id,c.parent_id,r.start_at FROM growth_activities c JOIN growth_activities r ON r.id=c.parent_id AND r.owner_id=c.owner_id WHERE r.settled_at IS NULL AND r.schedule_state='active' AND c.id NOT IN(SELECT child_id FROM growth_activity_merged_batches)`).all()
 db.exec('BEGIN')
 try{
  for(const c of children){
   db.prepare('INSERT OR IGNORE INTO growth_activity_members(activity_id,user_id,baseline_first_at) SELECT ?,user_id,CASE WHEN baseline_first_at<? THEN baseline_first_at ELSE NULL END FROM growth_activity_members WHERE activity_id=?').run(c.parent_id,c.start_at,c.id)
   db.prepare('INSERT OR IGNORE INTO growth_activity_tags(activity_id,user_id,added_at) SELECT ?,user_id,? FROM growth_activity_members WHERE activity_id=?').run(c.parent_id,Date.now(),c.id)
   db.prepare('INSERT OR IGNORE INTO crm_activity_links(kol_id,activity_id,created_at) SELECT kol_id,?,created_at FROM crm_activity_links WHERE activity_id=?').run(c.parent_id,c.id)
   db.prepare('UPDATE growth_activities SET schedule_version=schedule_version+1,tag_version=tag_version+1 WHERE id=?').run(c.parent_id)
   db.prepare('INSERT INTO growth_activity_merged_batches VALUES(?,?,?,?)').run(c.id,c.parent_id,c.owner_id,Date.now())
  }
  db.exec('COMMIT');return children.length
 }catch(e){db.exec('ROLLBACK');throw e}
}
module.exports={mergeActivityBatches}
