'use strict';
// Offline, read-only validation of a SAVED v5 weekly context payload.
// This is a shape/projection audit, not source freshness, model or operator acceptance.
const {DEFINITIONS}=require('../growth/weeklyCoverage');
const {modelContext}=require('./modelTransport');

function auditSavedWeeklyContext(snapshot){
 const raw=snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)?snapshot:{};
 const modules=Array.isArray(raw.weeklyCoverage?.modules)?raw.weeklyCoverage.modules:[];
 const expected=new Set(DEFINITIONS.map(row=>row.id));
 const actual=modules.map(row=>row?.id);
 const checks={
  pinnedV5Report:raw.weeklyReportContractVersion==='weekly-report-v2',
  versionedWeeklyManifest:raw.weeklyCoverage?.version==='weekly-coverage-v1',
  exactThirteenModules:actual.length===13&&new Set(actual).size===13&&
   actual.every(id=>expected.has(id)),
  validPeriod:Number.isFinite(raw.period?.start)&&Number.isFinite(raw.period?.end)&&
   raw.period.start<raw.period.end&&raw.period?.timezone==='Asia/Bangkok',
  scopedBusinessContext:typeof raw.business?.scope?.source==='string'&&
   raw.business.scope.source.length>0,
  savedEvidenceArray:Array.isArray(raw.evidence)&&raw.evidence.length>0
 };
 // Do not retrofit a historical v1-v4 snapshot into "v5" by projecting it today.
 if(Object.values(checks).every(Boolean)){
  try{
   const view=modelContext(raw,{transportVersion:'v5'});
   const bytes=Buffer.byteLength(JSON.stringify(view),'utf8');
   checks.v5Transport=view.transportVersion==='aggregated-business-v5';
   checks.businessBrainV2=view.businessBrain?.version==='logearn-business-brain-v2'&&
    view.businessBrain?.metricDictionaryVersion==='2';
   checks.fourProductRoles=view.businessBrain?.productMap?.products?.length===4;
   checks.sevenLifecycleStages=view.businessBrain?.lifecycle?.length===7;
   checks.northStarNotPromoted=view.businessBrain?.business?.northStarIntent?.status===
    'operator-direction-not-a-validated-composite-kpi';
   checks.under22KB=bytes<=22000;
  }catch(_error){
   // Never print an error containing raw context, user text or source payloads.
   checks.projectionBuilds=false;
  }
 }
 const snapshotContractReady=Object.values(checks).every(Boolean);
 return {
  status:snapshotContractReady?'snapshot-contract-ready':'snapshot-contract-incomplete',
  checks,
  // Deliberately never emit the input, owner IDs, evidence, prompts or metrics.
  scope:'saved-snapshot-only',
  liveSourceVerified:false,
  realModelRunVerified:false,
  operatorNorthStarConfirmed:false,
  paidOrExternalCallsMadeByAudit:false
 };
}
module.exports={auditSavedWeeklyContext};