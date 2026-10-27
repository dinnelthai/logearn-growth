const {DatabaseSync}=require('node:sqlite')
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const VERSION=1,RETENTION_MS=30*60000
const indexPath=()=>process.env.PATH_INDEX_DB?path.resolve(__dirname,'../..',process.env.PATH_INDEX_DB):path.join(__dirname,'../../data/path-index.db')
function sourceKey(){return createHash('sha256').update(JSON.stringify([process.env.DATABASE_URL||'',process.env.PGHOST||'',process.env.PGPORT||'',process.env.PGDATABASE||'',process.env.PGUSER||'',process.env.SOURCE_EVENTS_TABLE||'growth_events'])).digest('hex')}
function open({writable=false,filename=indexPath()}={}){
 if(!writable&&!fs.existsSync(filename))return null
 if(writable)fs.mkdirSync(path.dirname(filename),{recursive:true})
 const db=new DatabaseSync(filename,{readOnly:!writable});db.exec('PRAGMA busy_timeout=1000')
 if(writable){fs.chmodSync(filename,0o600);db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS index_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS generations(id INTEGER PRIMARY KEY,created_at INTEGER NOT NULL,snapshot TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS user_versions(user_key TEXT NOT NULL,valid_from INTEGER NOT NULL,valid_to INTEGER,signature TEXT NOT NULL,source TEXT,graph_first REAL,details_first REAL,graph_first_page TEXT,details_first_page TEXT,has_inferred INTEGER NOT NULL,event_count INTEGER NOT NULL,PRIMARY KEY(user_key,valid_from));
 CREATE TABLE IF NOT EXISTS event_versions(user_key TEXT NOT NULL,valid_from INTEGER NOT NULL,valid_to INTEGER,event_id TEXT NOT NULL,event_name TEXT NOT NULL,client_ts REAL NOT NULL,sid TEXT,ordinal INTEGER NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(user_key,valid_from,event_id));
 CREATE INDEX IF NOT EXISTS index_event_identity ON event_versions(user_key,event_id,valid_to);
 CREATE INDEX IF NOT EXISTS index_event_time ON event_versions(client_ts,user_key,valid_from,valid_to);
 CREATE INDEX IF NOT EXISTS index_event_user_time ON event_versions(user_key,client_ts,ordinal);
 CREATE INDEX IF NOT EXISTS index_event_session ON event_versions(user_key,sid,client_ts);
 CREATE TABLE IF NOT EXISTS session_versions(user_key TEXT NOT NULL,valid_from INTEGER NOT NULL,valid_to INTEGER,sid TEXT NOT NULL,first_t REAL NOT NULL,last_t REAL NOT NULL,PRIMARY KEY(user_key,valid_from,sid));
 CREATE INDEX IF NOT EXISTS index_session_identity ON session_versions(user_key,sid,valid_to);
 CREATE INDEX IF NOT EXISTS index_session_range ON session_versions(user_key,first_t,last_t);
 `)}
 return db
}
function compatible(db){try{const meta=Object.fromEntries(db.prepare('SELECT key,value FROM index_meta').all().map(r=>[r.key,r.value]));return meta.version===String(VERSION)&&meta.source===sourceKey()}catch{return false}}
function latest(db,{now=Date.now(),maxAge=90000}={}){
 if(!db||!compatible(db))return null
 const row=db.prepare('SELECT * FROM generations ORDER BY id DESC LIMIT 1').get()
 if(!row||now-row.created_at>maxAge)return null
 return {...JSON.parse(row.snapshot),path_index_generation:row.id}
}
function stats(){let db;try{db=open();if(!db||!compatible(db))return {state:'warming'};const row=db.prepare('SELECT * FROM generations ORDER BY id DESC LIMIT 1').get();if(!row)return {state:'warming'};return {state:Date.now()-row.created_at>90000?'stale':'ready',generation:row.id,age_ms:Date.now()-row.created_at,events:db.prepare('SELECT SUM(event_count) AS n FROM user_versions WHERE valid_to IS NULL').get().n||0,bytes:fs.statSync(indexPath()).size,last_refresh:JSON.parse(row.snapshot).snapshot_cutoff}}catch{return {state:'unavailable'}}finally{db?.close()}}
function prune(db,now=Date.now()){
 // Longer than the 15-minute public snapshot lifetime, including running jobs.
 const oldest=db.prepare('SELECT MIN(id) AS n FROM generations WHERE created_at>=?').get(now-RETENTION_MS).n
 if(oldest==null)return
 for(const table of ['event_versions','user_versions','session_versions'])db.prepare(`DELETE FROM ${table} WHERE valid_to IS NOT NULL AND valid_to<=?`).run(oldest)
 db.prepare('DELETE FROM generations WHERE id<?').run(oldest)
}
module.exports={open,latest,compatible,stats,prune,sourceKey,indexPath,VERSION}
