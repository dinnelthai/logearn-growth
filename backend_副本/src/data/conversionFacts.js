const remote=require('./hologres')
const {referralKeyFromUrl,referralKey}=require('../analytics/inviteAssociation')
const EVENTS=['page_viewed','first_visit_captured','login_button_clicked','login_succeeded','login_attempt_started','login_attempt_finished','login_stage_started','login_stage_finished','invite_link_visited','invite_validation_finished','invite_binding_finished','chip_analysis_viewed','chip_analysis_drilldown']
const LOGIN_EVENTS=['login_button_clicked','login_succeeded','login_attempt_started','login_attempt_finished','login_stage_started','login_stage_finished']
const FIELDS=['referral','referral_code_sha256','is_new_user','login_attempt_id','login_type','login_method','source','outcome','duration_ms','error_code','error_stage','reason_code','cancel_reason','stage','stage_attempt_id','invite_flow_id','validation_attempt_id','binding_attempt_id','referral_link_id','inviter_user_id','invitee_user_id','relation_id','bound_at','page_visit_id','page_path','view_mode','diagnostics_version','campaign_id','activity_id','first_landing_url']
const projection='jsonb_strip_nulls(jsonb_build_object('+FIELDS.map(k=>`'${k}',e.properties->'${k}'`).join(',')+'))'
async function conversionUsers(s,{start,end,source='all'},audience,{scene='invite'}={}){
 // Keep the real earliest non-login observation to preserve candidate membership and user-stage labels.
 // Login reports otherwise consume only login events, not page/analysis/invitation history.
 const login=scene==='login',context=login?`, context AS (
 SELECT e.*,f.source,ROW_NUMBER() OVER(PARTITION BY e.user_key,(e.event_name=ANY($8::text[])) ORDER BY e.client_ts,e.event_id) AS observation_rank
 FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts<=$4 AND e.event_name=ANY($7::text[])
 AND EXISTS(SELECT 1 FROM candidates c WHERE c.user_key=e.user_key)
 )`:''
 const rows=await remote.query(`${remote.eventsCte()}, candidates AS (
 SELECT DISTINCT e.user_key FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts>=$2 AND e.client_ts<$3
 AND e.event_name=ANY($7::text[]) AND ($5::text='all' OR f.source=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 )${context} SELECT e.user_key,e.user_id,e.anonymous_id,e.event_id,e.event_name,e.client_ts,e.session_id,e.device,e.app_version,e.page,${login?'e':'f'}.source,${projection} AS properties
 ${login?'FROM context e WHERE (e.observation_rank=1 OR e.event_name=ANY($8::text[]))':`FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts<=$4 AND e.event_name=ANY($7::text[])
 AND EXISTS(SELECT 1 FROM candidates c WHERE c.user_key=e.user_key)`} ORDER BY e.user_key,e.client_ts,e.event_id LIMIT 150001`,[s.snapshot_cutoff,start,end,Date.parse(s.snapshot_cutoff),source,audience,EVENTS,...(login?[LOGIN_EVENTS]:[])])
 if(rows.length>150000||Buffer.byteLength(JSON.stringify(rows))>32*1024*1024)throw Object.assign(new Error('转化上下文超过预算，请缩小日期或来源'),{status:422})
 const users=new Map(),types={login_button_clicked:'login_click',login_succeeded:'login',chip_analysis_viewed:'chip',chip_analysis_drilldown:'chip'}
 for(const r of rows){if(!users.has(r.user_key))users.set(r.user_key,{id:r.user_key,source:r.source||'未知',events:[]});users.get(r.user_key).events.push({type:types[r.event_name]||r.event_name,raw_name:r.event_name,event_id:r.event_id,t:Number(r.client_ts),actor_user_id:r.user_id,anonymous_id:r.anonymous_id,session_id:r.session_id,device:r.device,app_version:r.app_version,referral_key:(/^[a-f0-9]{64}$/.test(r.properties?.referral_code_sha256||'')?r.properties.referral_code_sha256:null)||referralKey(r.properties?.referral)||referralKeyFromUrl(r.page)||referralKeyFromUrl(r.properties?.first_landing_url),properties:Object.fromEntries(Object.entries(r.properties||{}).filter(([k])=>!['first_landing_url','referral_code_sha256','referral'].includes(k))),login_type:r.properties?.login_type})}
 return [...users.values()]
}
async function invitationRelations(s){
 const rows=await remote.query(`SELECT r.id,r.user_id,r.level1_user_id,r.invitation_time,r.is_valid,r.inviter_referral_code,
 EXISTS(SELECT 1 FROM public.invitation_relation_change_log c WHERE c.user_id=r.user_id AND c.created_time<=$1::timestamptz AND c.old_inviter_user_id IS NOT NULL AND c.old_inviter_user_id<>0 AND c.old_inviter_user_id<>c.new_inviter_user_id) AS has_rebinding,a.created_at AS account_created_at,
 inviter.account_id IS NOT NULL AS inviter_exists FROM public.user_invitation_relation r
 LEFT JOIN public.account_v2 a ON a.account_id=r.user_id AND a.created_at<=$1::timestamptz
 LEFT JOIN public.account_v2 inviter ON inviter.account_id=r.level1_user_id AND inviter.created_at<=$1::timestamptz
 WHERE r.created_time<=$1::timestamptz AND (r.invitation_time<=$1::timestamptz OR r.invitation_time IS NULL) LIMIT 80001`,[s.snapshot_cutoff])
 if(rows.length>80000||Buffer.byteLength(JSON.stringify(rows))>16*1024*1024)throw Object.assign(new Error('邀请关系事实超过预算'),{status:422})
 return rows.map(r=>({id:String(r.id),invitee:String(r.user_id),inviter:r.level1_user_id==null?null:String(r.level1_user_id),bound_at:r.invitation_time==null?null:Date.parse(r.invitation_time),valid:r.is_valid===true,referral_key:referralKey(r.inviter_referral_code),has_rebinding:r.has_rebinding===true,account_created_at:r.account_created_at==null?null:Date.parse(r.account_created_at),inviter_exists:r.inviter_exists===true}))
}
// Independent code ownership and account creation evidence; never persist raw codes.
async function registrationAccounts(s){
 const rows=await remote.query(`SELECT account_id,invite_code,created_at FROM public.account_v2 WHERE created_at<=$1::timestamptz LIMIT 80001`,[s.snapshot_cutoff])
 if(rows.length>80000||Buffer.byteLength(JSON.stringify(rows))>16*1024*1024)throw Object.assign(new Error('注册邀请账号事实超过预算'),{status:422})
 return rows.map(r=>({id:String(r.account_id),created_at:Date.parse(r.created_at),code_key:referralKey(r.invite_code)}))
}
module.exports={conversionUsers,invitationRelations,registrationAccounts}
