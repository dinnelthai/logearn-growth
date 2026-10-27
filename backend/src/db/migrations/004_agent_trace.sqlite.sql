CREATE TABLE IF NOT EXISTS agent_prompts(hash TEXT PRIMARY KEY,role TEXT NOT NULL,content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_calls(owner_id TEXT NOT NULL,run_id TEXT NOT NULL,trace_id TEXT NOT NULL,round INTEGER NOT NULL,status TEXT NOT NULL,prompts TEXT NOT NULL,result TEXT,started_at INTEGER NOT NULL,finished_at INTEGER,PRIMARY KEY(owner_id,trace_id,round));
CREATE INDEX IF NOT EXISTS idx_agent_calls_run ON agent_calls(owner_id,run_id,status);
