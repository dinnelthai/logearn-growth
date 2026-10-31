#!/usr/bin/env node
'use strict';
// Read a locally exported ai_analysis_records.context_payload JSON from stdin.
// Never log the input, including on parse/projection failure.
const fs=require('node:fs');
const {auditSavedWeeklyContext}=require('../src/ai/business/savedContextAudit');
let output;
try{
 const raw=JSON.parse(fs.readFileSync(0,'utf8'));
 output=auditSavedWeeklyContext(raw);
}catch(_error){
 output={status:'invalid-json-or-unreadable-input',checks:{},scope:'saved-snapshot-only',
  liveSourceVerified:false,realModelRunVerified:false,
  operatorNorthStarConfirmed:false,paidOrExternalCallsMadeByAudit:false};
}
process.stdout.write(JSON.stringify(output,null,2)+'\n');
if(output.status!=='snapshot-contract-ready')process.exitCode=1;