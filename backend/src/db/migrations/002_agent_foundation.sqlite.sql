CREATE TABLE IF NOT EXISTS agent_goals (owner_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner_id,id,version));
CREATE TABLE IF NOT EXISTS agent_run_goals (owner_id TEXT NOT NULL,run_id TEXT NOT NULL,goal_id TEXT NOT NULL,goal_version INTEGER NOT NULL,PRIMARY KEY(owner_id,run_id),FOREIGN KEY(owner_id,goal_id,goal_version) REFERENCES agent_goals(owner_id,id,version));
CREATE TABLE IF NOT EXISTS agent_changes (owner_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner_id,id));
