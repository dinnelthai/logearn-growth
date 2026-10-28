import {getToken} from '../auth/authClient.js';
const BASE=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001';
async function aiFetch(path,options={}){
  const token=getToken();
  const response=await fetch(BASE+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const body=await response.json().catch(()=>({}));
  if(response.status===401){
    // Notify the shell without retrying a request or disclosing the token.
    globalThis.dispatchEvent?.(new CustomEvent('logearn:session-expired'));
  }
  if(!response.ok)throw Object.assign(new Error(body.error||`HTTP ${response.status}`),{status:response.status});
  return body;
}
export const createBusinessAnalysis=params=>aiFetch('/api/ai-analysis/analyze',{method:'POST',body:JSON.stringify(params)});
export const getAnalysisList=(options={})=>aiFetch('/api/ai-analysis/list?'+new URLSearchParams({limit:'20',...options}));
export const getAnalysisDetail=id=>aiFetch('/api/ai-analysis/'+encodeURIComponent(id));
export const getJobStatus=id=>aiFetch('/api/ai-analysis/jobs/'+encodeURIComponent(id)+'/status');
export const updateSuggestionStatus=(id,updates)=>aiFetch('/api/ai-analysis/suggestions/'+encodeURIComponent(id)+'/status',{method:'PUT',body:JSON.stringify(updates)});
export const createRetrospective=(id,requestKey)=>aiFetch('/api/ai-analysis/suggestions/'+encodeURIComponent(id)+'/retrospective',{method:'POST',body:JSON.stringify({requestKey})});
export const getRetrospectives=()=>aiFetch('/api/ai-analysis/retrospectives/list');
export const getCostStats=()=>aiFetch('/api/ai-analysis/cost-stats');
export const getAvailableModels=()=>aiFetch('/api/ai/models');

export const retryAnalysis=id=>aiFetch('/api/ai-analysis/'+encodeURIComponent(id)+'/retry',{method:'POST',body:'{}'});

export const getAgentHealth=()=>aiFetch('/api/growth-agent/health');
export const getEvidence=id=>aiFetch('/api/growth-agent/evidence/'+encodeURIComponent(id));
export const getJobCheckpoint=id=>aiFetch('/api/ai-analysis/jobs/'+encodeURIComponent(id)+'/checkpoint');

export const cancelAnalysis=id=>aiFetch('/api/ai-analysis/'+encodeURIComponent(id)+'/cancel',{method:'POST',body:'{}'});

export const resumeAnalysis=id=>aiFetch('/api/ai-analysis/'+encodeURIComponent(id)+'/resume',{method:'POST',body:'{}'});

export const getGrowthSkills=()=>aiFetch('/api/ai-analysis/growth-skills');
export const previewGrowthPlan=(reportId,goal='activation')=>aiFetch('/api/ai-analysis/growth-plan',{
  method:'POST',body:JSON.stringify({reportId,goal})
});

export const previewGrowthSignals=reportId=>aiFetch('/api/ai-analysis/growth-signals',{method:'POST',body:JSON.stringify({reportId})});

export const getGrowthReviewQueue=()=>aiFetch('/api/ai-analysis/growth-review-queue');

export const getGrowthInbox=()=>aiFetch('/api/ai-analysis/growth-inbox');

export const getGrowthMonitorControl=()=>aiFetch('/api/ai-analysis/growth-alerts/monitor-control');
export const setGrowthMonitorControl=(enabled,expectedVersion)=>aiFetch(
 '/api/ai-analysis/growth-alerts/monitor-control',{
 method:'PUT',body:JSON.stringify({enabled,expectedVersion})
});
export const getGrowthAlerts=(includeResolved=false)=>aiFetch('/api/ai-analysis/growth-alerts'+(includeResolved?'?resolved=1':''));
export const scanGrowthAlerts=(goal='activation',source='all')=>aiFetch('/api/ai-analysis/growth-alerts/scan',{
  method:'POST',body:JSON.stringify({goal,source})
});
export const changeGrowthAlert=(id,expectedVersion,action,extra={})=>aiFetch(
  '/api/ai-analysis/growth-alerts/'+encodeURIComponent(id)+'/action',{
    method:'POST',body:JSON.stringify({action,expectedVersion,...extra})
  });
export const getGrowthAlertHistory=id=>aiFetch('/api/ai-analysis/growth-alerts/'+encodeURIComponent(id)+'/history');

export const getGrowthBudget=()=>aiFetch('/api/ai-analysis/growth-budget');
export const getGrowthInvestigations=()=>aiFetch('/api/ai-analysis/growth-investigations');
export const decideGrowthInvestigation=(id,expectedVersion,action)=>aiFetch(
  '/api/ai-analysis/growth-investigations/'+encodeURIComponent(id)+'/action',
  {method:'POST',body:JSON.stringify({action,expectedVersion})}
);
export const getGrowthNotifications=(unreadOnly=false)=>aiFetch(
  '/api/ai-analysis/growth-notifications'+(unreadOnly?'?unread=1':'')
);
export const markGrowthNotificationRead=id=>aiFetch(
  '/api/ai-analysis/growth-notifications/'+encodeURIComponent(id)+'/read',
  {method:'POST',body:'{}'}
);

export const getGrowthInvestigationTimeline=id=>aiFetch('/api/ai-analysis/growth-investigations/'+encodeURIComponent(id)+'/timeline');

export const getSeoImports=()=>aiFetch('/api/ai-analysis/growth-seo/imports');
export const importSeoSnapshot=payload=>aiFetch('/api/ai-analysis/growth-seo/import',{
  method:'POST',body:JSON.stringify(payload)
});
export const previewSeoSnapshot=(snapshotId,startDate=null,endDate=null)=>aiFetch(
 '/api/ai-analysis/growth-seo/preview',{
  method:'POST',body:JSON.stringify({snapshotId,startDate,endDate})
 });
export const previewKolPerformance=(start,end)=>aiFetch('/api/ai-analysis/growth-kol/preview',{
 method:'POST',body:JSON.stringify({start,end,source:'all'})
});

export const getGscConnection=()=>aiFetch('/api/ai-analysis/growth-seo/gsc/connection');
export const saveGscSite=siteUrl=>aiFetch('/api/ai-analysis/growth-seo/gsc/settings',{
 method:'PUT',body:JSON.stringify({siteUrl})
});
export const syncGscPerformance=(startDate,endDate)=>aiFetch(
 '/api/ai-analysis/growth-seo/gsc/sync',{
  method:'POST',body:JSON.stringify({startDate,endDate})
 });
export const getGscPerformance=(range=null)=>aiFetch('/api/ai-analysis/growth-seo/gsc/report'+
 (range?'?'+new URLSearchParams(range):''));

export const getGscSitemaps=()=>aiFetch('/api/ai-analysis/growth-seo/gsc/sitemaps');
export const inspectGscUrl=inspectionUrl=>aiFetch('/api/ai-analysis/growth-seo/gsc/inspect',{
 method:'POST',body:JSON.stringify({inspectionUrl})
});

export const getAutonomyStatus=(source='all')=>aiFetch(
 '/api/ai-analysis/growth-agent/status?source='+encodeURIComponent(source));
export const getAutonomyTargets=(source='all')=>aiFetch(
 '/api/ai-analysis/growth-agent/targets?source='+encodeURIComponent(source));
export const saveAutonomyTarget=value=>aiFetch('/api/ai-analysis/growth-agent/targets',{
 method:'PUT',body:JSON.stringify(value)
});
export const getAutonomyBriefs=(source='all')=>aiFetch(
 '/api/ai-analysis/growth-agent/briefs?source='+encodeURIComponent(source));
export const getAutonomyLearning=(source='all')=>aiFetch(
 '/api/ai-analysis/growth-agent/learning?source='+encodeURIComponent(source));
export const refreshAutonomyBrief=(goals=['activation','retention','conversion','revenue'],source='all')=>aiFetch(
 '/api/ai-analysis/growth-agent/refresh',{
 method:'POST',body:JSON.stringify({goals,source})
});
