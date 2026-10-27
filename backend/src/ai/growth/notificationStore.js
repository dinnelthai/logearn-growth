'use strict';
const pool=require('../../db/aiPool');
function createNotificationStore(query=(sql,args)=>pool.query(sql,args)){
 async function list(ownerId,{limit=50,unreadOnly=false}={}){
  if(typeof ownerId!=='string'||!ownerId||
   !Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('通知列表参数无效');
  const r=await query(`SELECT id,kind,resource_id,period_end,message,created_at,read_at
    FROM ai_growth_notifications
    WHERE owner_id=$1 AND ($3::boolean=false OR read_at IS NULL)
    ORDER BY created_at DESC LIMIT $2`,[ownerId,limit,unreadOnly===true]);
  return r.rows;
 }
 async function markRead(ownerId,id,now=Date.now()){
  if(!ownerId||typeof id!=='string'||!id||!Number.isSafeInteger(now))throw Error('通知操作无效');
  const r=await query(`UPDATE ai_growth_notifications SET read_at=COALESCE(read_at,$3)
    WHERE id=$1 AND owner_id=$2 RETURNING id,kind,resource_id,read_at`,[id,ownerId,now]);
  return r.rows[0]||null;
 }
 return {list,markRead};
}
module.exports={createNotificationStore};
