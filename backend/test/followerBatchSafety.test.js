'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const source=path.join(__dirname,'../src/services/followerAudit.js');
test('durable follower batch module parses and requires a finite opt-in budget',()=>{
 const check=cp.spawnSync(process.execPath,['--check',source],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 const code=fs.readFileSync(source,'utf8');
 assert.match(code,/FOLLOWER_AUTO_ANALYZE_ENABLED/);
 assert.match(code,/FOLLOWER_AUTO_MAX_PROFILES/);
 assert.match(code,/x_follower_batch_progress/);
 assert.match(code,/remaining_credits<600/);
 assert.match(code,/waiting-budget/);
 assert.match(code,/delay/);
});
