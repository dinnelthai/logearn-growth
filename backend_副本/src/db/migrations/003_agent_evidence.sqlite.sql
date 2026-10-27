CREATE TABLE IF NOT EXISTS agent_evidence (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_agent_evidence_owner ON agent_evidence(owner_id);
