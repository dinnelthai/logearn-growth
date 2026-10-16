// Additive, idempotent migration. Reporting rosters are never rewritten.
function upgradeActivities(db){
 const columns=new Set(db.prepare('PRAGMA table_info(growth_activities)').all().map(c=>c.name))
 for(const [name,type] of Object.entries({goal:"TEXT NOT NULL DEFAULT 'activation'",parent_id:'TEXT',archived_at:'INTEGER',tag_version:'INTEGER NOT NULL DEFAULT 0',target_metric:'TEXT',target_value:'REAL',schedule_state:"TEXT NOT NULL DEFAULT 'active'",schedule_version:'INTEGER NOT NULL DEFAULT 0',baseline_frozen_at:'INTEGER',schedule_error:'TEXT',schedule_last_attempt_at:'INTEGER'}))if(!columns.has(name))db.exec(`ALTER TABLE growth_activities ADD COLUMN ${name} ${type}`)
 if(columns.has('start_at'))db.exec("CREATE INDEX IF NOT EXISTS idx_activity_schedule_due ON growth_activities(schedule_state,archived_at,start_at,schedule_last_attempt_at)");
 if(columns.has('start_at'))db.exec("UPDATE growth_activities SET baseline_frozen_at=start_at WHERE schedule_state='active' AND baseline_frozen_at IS NULL")
 // Some schema tests exercise just the legacy activity table.
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='growth_activity_tags'").get()){
  db.exec('BEGIN')
  try{db.exec('INSERT OR IGNORE INTO growth_activity_tags SELECT m.activity_id,m.user_id,a.start_at FROM growth_activity_members m JOIN growth_activities a ON a.id=m.activity_id WHERE a.tag_version=0');db.exec('UPDATE growth_activities SET tag_version=1 WHERE tag_version=0');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }
}
function upgradeCohorts(db){
 const columns=new Set(db.prepare('PRAGMA table_info(cohorts)').all().map(c=>c.name))
 for(const [name,type]of Object.entries({kind:"TEXT NOT NULL DEFAULT 'static'",rule_json:'TEXT'}))if(!columns.has(name))db.exec(`ALTER TABLE cohorts ADD COLUMN ${name} ${type}`)
}
module.exports={upgradeActivities,upgradeCohorts}
