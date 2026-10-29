'use strict';
// Operational rates from observed cumulative public metrics, never X ranking scores.
const HOUR=3600000;
const safe=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const ratio=(part,views)=>safe(part)!=null&&safe(views)>0?
 Math.round(part/views*10000)/100:null;
function rates(p){
 const views=safe(p.impressions);
 const likes=safe(p.likes),replies=safe(p.replies),reposts=safe(p.reposts);
 return {likeRate:ratio(likes,views),replyRate:ratio(replies,views),
  repostRate:ratio(reposts,views),
  engagementRate:likes!=null&&replies!=null&&reposts!=null?
   ratio(likes+replies+reposts,views):null};
}
// Strict ±6h observation window; no retroactive backfill from current totals.
function milestone(post,snapshots,hours){
 const published=Date.parse(post.published_at),target=published+hours*HOUR;
 if(!Number.isFinite(published))return null;
 const eligible=snapshots.filter(s=>Number.isFinite(s.observed_at)&&
  Math.abs(s.observed_at-target)<=6*HOUR&&s.observed_at>=published);
 if(!eligible.length)return null;
 eligible.sort((a,b)=>Math.abs(a.observed_at-target)-Math.abs(b.observed_at-target)||
  a.observed_at-b.observed_at);
 const s=eligible[0];
 return {hours,observedAt:s.observed_at,ageHours:Math.round((s.observed_at-published)/HOUR*10)/10,
  impressions:safe(s.impressions),likes:safe(s.likes),replies:safe(s.replies),
  reposts:safe(s.reposts),...rates(s)};
}
function enrich(post,snapshots=[]){
 const p={...post,source:'twitterapi.io',...rates(post)};
 const age=post.observed_at-Date.parse(post.published_at);
 return {...p,observedAgeHours:Number.isFinite(age)&&age>=0?Math.round(age/HOUR*10)/10:null,
  snapshotCount:snapshots.length,
  milestones:{h24:milestone(post,snapshots,24),h48:milestone(post,snapshots,48)}};
}
function benchmark(posts,key='h24'){
 const eligible=posts.filter(p=>p.milestones?.[key]?.impressions>0);
 // Require other posts as comparators to avoid declaring a one-post "baseline".
 if(eligible.length<4)return {status:'insufficient',sampleSize:eligible.length,medianViews:null};
 const sorted=eligible.map(p=>p.milestones[key].impressions).sort((a,b)=>a-b);
 const mid=sorted.length>>1;
 return {status:'available',sampleSize:sorted.length,
  medianViews:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,
  window:'publish-age ±6h',cohort:'same-account-only; topics not classified'};
}
module.exports={safe,ratio,rates,milestone,enrich,benchmark};
