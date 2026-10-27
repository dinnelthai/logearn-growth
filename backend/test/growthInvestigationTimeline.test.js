'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInvestigationTimeline,stageFor}=require('../src/ai/growth/investigationTimeline');
const original={
 id:'proposal-1',owner_id:'alice',alert_id:'alert-1',status:'approved',version:2,
 period_end:1000,created_at:100,updated_at:200,analysis_id:'analysis-1',
 evidence:{baseline:100,observed:55,absolute:-45,fraction:-0.45,
  periodStart:100,periodEnd:1000,evidence:{baselineAnalysisId:'daily-1',currentAnalysisId:'daily-2'}}
};
const latest={id:'alert-1',owner_id:'alice',metric:'active_users',source:'all',
 goal:'activation',priority:'P0',direction:'decline',status:'acknowledged',
 last_period_end:2000,evidence:{baseline:55,observed:20}};
const analysis={id:'analysis-1',owner_id:'alice',title:'Analysis',status:'completed',
 filter_conditions:{proposalId:'proposal-1',sourceAlertId:'alert-1'},
 result:{summary:'Investigated',keyFindings:['Drop exists'],claims:[{id:'c1'}],
  evidenceIds:['e1']},created_at:300,completed_at:400};
const suggestion={id:'s1',owner_id:'alice',analysis_id:'analysis-1',
 priority:'P0',business_problem:'Activation',action:'Review funnel',
 user_status:'executed',data_evidence:{metrics:[]},
 validation_metrics:{primary:'active_users'},actual_action:'Examined activation',
 executed_at:500};
const retrospective={id:'r1',owner_id:'alice',suggestion_id:'s1',
 conclusion:'Observed improvement, not proven causal',confidence:'low',
 has_improvement:true,has_causality:false,created_at:600};
function fixture(overrides={}){
 let counts={analysis:0,suggestions:0,reviews:0};
 const proposal=overrides.proposal===undefined?original:overrides.proposal;
 const alert=overrides.alert===undefined?latest:overrides.alert;
 const record=overrides.analysis===undefined?analysis:overrides.analysis;
 const reviews=overrides.reviews===undefined?[retrospective]:overrides.reviews;
 const service=createInvestigationTimeline({
  proposalStore:{async get(owner,id){return owner==='alice'&&id==='proposal-1'?proposal:null}},
  alertStore:{async get(owner,id){return owner==='alice'&&id==='alert-1'?alert:null}},
  recordsApi:{
   async getAnalysisRecord(id,owner){counts.analysis++;return owner==='alice'&&id==='analysis-1'?record:null},
   async listSuggestionsByAnalysis(){counts.suggestions++;return [suggestion]},
   async listRetrospectivesByAnalysis(id,owner){counts.reviews++;assert.equal(id,'analysis-1');assert.equal(owner,'alice');return reviews}
  }
 });
 return {service,counts};
}
test('complete lifecycle reuses frozen proposal evidence, not a later alert observation',async()=>{
 const {service,counts}=fixture();
 const state=await service.get('alice','proposal-1');
 assert.equal(state.readOnly,true);assert.equal(state.paidCalls,0);assert.equal(state.externalActions,0);
 assert.equal(state.stage,'retrospective-recorded');
 assert.equal(state.alert.latestPeriodEnd,2000);
 assert.deepEqual(state.originalObservation.evidence,{
  baselineAnalysisId:'daily-1',currentAnalysisId:'daily-2'});
 assert.equal(state.originalObservation.baseline,100);
 assert.equal(state.originalObservation.observed,55);
 assert.equal(state.counts.suggestions,1);assert.equal(state.counts.retrospectives,1);
 assert.equal(state.analysis.summary,'Investigated');
 assert.deepEqual(state.analysis.evidenceIds,['e1']);
 assert.equal(state.retrospectives[0].hasCausality,false);
 assert.deepEqual(counts,{analysis:1,suggestions:1,reviews:1});
});
test('owner denial and wrong proposal do not load linked records',async()=>{
 const {service,counts}=fixture();
 assert.equal(await service.get('bob','proposal-1'),null);
 assert.equal(await service.get('alice','not-found'),null);
 assert.deepEqual(counts,{analysis:0,suggestions:0,reviews:0});
});
test('cross-owner or tampered proposal analysis links must fail closed',async()=>{
 const {service}=fixture({analysis:{...analysis,filter_conditions:{proposalId:'other',sourceAlertId:'alert-1'}}});
 await assert.rejects(service.get('alice','proposal-1'),/关联不一致/);
 const denied=fixture({analysis:{...analysis,owner_id:'bob'}});
 await assert.rejects(denied.service.get('alice','proposal-1'),/关联不一致/);
 const alertMissing=fixture({alert:null});
 await assert.rejects(alertMissing.service.get('alice','proposal-1'),/告警记录缺失/);
});
test('unapproved proposals never load analysis or invent model results',async()=>{
 const draft=fixture({proposal:{...original,status:'proposed',analysis_id:null}});
 const state=await draft.service.get('alice','proposal-1');
 assert.equal(state.stage,'awaiting-approval');
 assert.equal(state.analysis,null);
 assert.equal(state.actions.length,0);
 assert.deepEqual(draft.counts,{analysis:0,suggestions:0,reviews:0});
 const dismissed=fixture({proposal:{...original,status:'dismissed',analysis_id:null}});
 assert.equal((await dismissed.service.get('alice','proposal-1')).stage,'dismissed');
});
test('executed suggestion without saved retrospective remains awaiting review',async()=>{
 const {service}=fixture({reviews:[]});
 const state=await service.get('alice','proposal-1');
 assert.equal(state.stage,'awaiting-retrospective');
 assert.equal(state.counts.retrospectives,0);
 assert.equal(stageFor({status:'approved'},{status:'completed'},[{user_status:'pending'}],[]),'awaiting-action-approval');
});

test('foreign or unrelated retrospective rows are blocked even with an existing case',async()=>{
 const foreign=fixture({reviews:[{...retrospective,owner_id:'bob'}]});
 await assert.rejects(foreign.service.get('alice','proposal-1'),/复盘关联不一致/);
 const unrelated=fixture({reviews:[{...retrospective,suggestion_id:'some-other-action'}]});
 await assert.rejects(unrelated.service.get('alice','proposal-1'),/复盘关联不一致/);
});
