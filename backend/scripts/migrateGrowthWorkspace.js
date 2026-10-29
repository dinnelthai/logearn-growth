#!/usr/bin/env node
'use strict';
// Production schema changes require a reviewed SQLite backup and an approved
// worker/API topology. This script does not migrate external databases.
if(require.main===module){
 if(process.env.GROWTH_WORKSPACE_SCHEMA_APPROVED!=='1'){
  console.error('Refusing to change database schema. Backup and review first, then explicitly set GROWTH_WORKSPACE_SCHEMA_APPROVED=1.');
  process.exitCode=1;
 }else{
  try{
   const db=require('../src/db/connection');
   require('../src/ai/growth/workspace/store').workspaceStore(db,{initialize:true});
   require('../src/ai/growth/opportunityStore').createOpportunityStore(db,{initialize:true});
   console.log('Growth Workspace SQLite schema installed. No user data was imported or modified.');
  }catch(e){console.error(e.message);process.exitCode=1}
 }
}
