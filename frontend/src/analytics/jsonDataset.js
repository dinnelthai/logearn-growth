import {normalizeApiResponse} from './normalize.js'
import lifecycleRulesJson from '../lifecycle/lifecycle-rules.json'
import logearnUserJson from '../api/logearn_user.json'
import logearnUserReferralJson from '../api/logearn_user_referral.json'
import logearnEventsJson from '../api/logearn_events.json'
import channelsJson from '../channels/channels.json'
import tradesJson from '../api/trades.json'

// Observation window — update when regenerating mock data
const AS_OF    = '2026-10-06T06:00:00.000Z'
const START_AT = '2026-08-18T06:00:00.000Z'
const TIMEZONE = 'Asia/Bangkok'

export function datasetFromJson(){
 if(!Array.isArray(logearnEventsJson?.logearn_events)||!Array.isArray(logearnUserJson?.logearn_users))throw Error('缺少 logearn_events/logearn_users JSON');
 const asOf=Date.parse(AS_OF),startAt=Date.parse(START_AT);
 if(!Number.isFinite(asOf)||!Number.isFinite(startAt)||startAt>asOf)throw Error('JSON 数据日期无效');
 const referrals=(logearnUserReferralJson?.logearn_user_referrals??[]).flatMap(r=>
   (r.invitees_l1??[]).map(inv=>({inviter_user_id:r.user_id,invitee_user_id:inv.user_id,bound_at:inv.bound_at}))
 );
 const data=normalizeApiResponse({users:[],events:logearnEventsJson.logearn_events,logearnUsers:logearnUserJson.logearn_users,referrals,trades:tradesJson?.trades??null,startAt,asOf,timezone:TIMEZONE});
 data.meta.source='json';data.channelRules=channelsJson?.rules??null;data.lifecycleRules=lifecycleRulesJson?.rules??null;data.userReferrals=logearnUserReferralJson?.logearn_user_referrals??null;
 return data;
}
