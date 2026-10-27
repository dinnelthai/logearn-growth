const METRICS={activation:['first_analysis_users'],engagement:['analysis_users','returning_analysis_users','multi_day_users'],trade:['trade_users','transactions','volume_usd']}
function validateTarget(body,goal){
 const metric=body.target_metric,value=body.target_value
 if((metric==null||metric==='')&&(value==null||value===''))return {target_metric:null,target_value:null}
 if(!METRICS[goal]?.includes(metric)||typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e12||(metric==='volume_usd'?Number(value.toFixed(2))!==value:!Number.isSafeInteger(value)))throw Object.assign(new Error('请选择当前活动目标支持的指标，目标值须为正数；人数/笔数为整数，USD最多两位小数'),{status:400})
 return {target_metric:metric,target_value:value}
}
function targetProgress(activity,result){
 if(!activity.target_metric||activity.target_value==null)return null
 const metric=activity.target_metric,t=result.performance?.total,errors=result.performance_errors||{}
 const source=METRICS.trade.includes(metric)?'trade':'analysis'
 const value=metric==='first_analysis_users'?result.summary.completed:t?.[metric]
 const pending=Date.parse(result.as_of||result.snapshot_cutoff)<activity.start_at
 const actual=pending||errors.account||errors[source]?null:value??null
 const partial=metric==='volume_usd'&&actual!=null&&!!(t?.missing_values||t?.excluded_trades)
 return {metric,target:activity.target_value,actual,ratio:actual==null?null:actual/activity.target_value,status:pending?'pending':actual==null?'unknown':partial?'partial':actual>=activity.target_value?'reached':'in_progress',partial,definition:'observed'}
}
module.exports={METRICS,validateTarget,targetProgress}
