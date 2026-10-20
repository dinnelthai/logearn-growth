import {observationCeiling} from './coverage.js'
import {normalizeApiResponse} from './normalize.js'
export function datasetFromJson(input){
 if(input){
  const manifest=input.manifest??{};
  const startAt=Date.parse(manifest.start_at),asOf=observationCeiling({events:manifest,trades:input.trades?.meta,asOf:Date.parse(manifest.as_of)});
  const users=input.users?.users??input.users?.logearn_users;
  const events=input.events?.events??input.events?.logearn_events;
  if(!Array.isArray(users)||!Array.isArray(events)||!Number.isFinite(startAt)||!Number.isFinite(asOf)||startAt>asOf)throw Error('JSON 数据格式或日期无效');
  const data=normalizeApiResponse({users,events,referrals:input.referrals?.referrals??null,trades:input.trades?.trades??null,startAt,asOf,timezone:manifest.timezone??'Asia/Bangkok',channelRules:input.channels?.rules,coverage:manifest,tradesCoverage:input.trades?.meta});
  data.meta.source='json';data.channelRules=input.channels?.rules??null;data.lifecycleRules=input['lifecycle-rules']?.rules??null;
  return data;
 }
 throw Error('缺少 JSON 数据');
}

export function datasetFromBundle({logearnEventsJson,logearnUserJson,logearnUserReferralJson,tradesJson,channelsJson,lifecycleRulesJson}){
 if(!Array.isArray(logearnEventsJson?.logearn_events)||!Array.isArray(logearnUserJson?.logearn_users))throw Error('缺少 logearn_events/logearn_users JSON');
 const asOf=observationCeiling({events:logearnEventsJson.meta,trades:tradesJson.meta,asOf:Date.parse(logearnEventsJson.meta?.as_of)}),startAt=Date.parse(logearnEventsJson.meta?.start_at);
 if(!Number.isFinite(asOf)||!Number.isFinite(startAt)||startAt>asOf)throw Error('JSON 数据日期无效');
 const referrals=(logearnUserReferralJson?.logearn_user_referrals??[]).flatMap(r=>
   (r.invitees_l1??[]).map(inv=>({inviter_user_id:r.user_id,invitee_user_id:inv.user_id,bound_at:inv.bound_at,referral_link_id:inv.referral_link_id??null,share_type:inv.share_type??null}))
 );
 const data=normalizeApiResponse({users:[],events:logearnEventsJson.logearn_events,logearnUsers:logearnUserJson.logearn_users,referrals,trades:tradesJson?.trades??null,startAt,asOf,timezone:logearnEventsJson.meta?.timezone??'Asia/Bangkok',channelRules:channelsJson?.rules,coverage:logearnEventsJson.meta,tradesCoverage:tradesJson.meta});
 data.meta.source='json';data.channelRules=channelsJson?.rules??null;data.lifecycleRules=lifecycleRulesJson?.rules??null;data.userReferrals=logearnUserReferralJson?.logearn_user_referrals??null;
 return data;
}
