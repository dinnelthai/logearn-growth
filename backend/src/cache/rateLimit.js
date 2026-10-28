const { getClient } = require('./redis');
const logger = console;

const NAMESPACE = 'rate:limit';

/**
 * 检查速率限制
 */
// Existing read-only/non-model rate limits retain their current fail-open
// behavior. Paid LLM calls explicitly choose failClosed to avoid bypassing
// cost safeguards when the shared Redis tunnel is unavailable.
function createRateLimiter(redisClient=getClient,log=logger){
 async function checkLimit(key, limit, window = 3600, {failClosed=false}={}) {
  try {
   const redis=redisClient();
   if(!redis)throw Error('Redis 客户端不可用');
   const fullKey=`${NAMESPACE}:${key}`;
   const current=await redis.incr(fullKey);
   if(current===1)await redis.expire(fullKey,window);
   if(current>limit){
    const ttl=await redis.ttl(fullKey);
    log.warn(`Rate limit exceeded for ${key}: ${current}/${limit}`);
    return {allowed:false,current,limit,resetIn:ttl};
   }
   return {allowed:true,current,limit,remaining:limit-current};
  }catch(error){
   log.error('Rate limit check error:',error.message);
   if(failClosed)throw Error('LLM 限流 Redis 不可用，已阻止付费调用：'+error.message);
   return {allowed:true};
  }
 }
 return {checkLimit};
}
const {checkLimit}=createRateLimiter();

/**
 * 重置速率限制
 */
async function reset(key) {
  try {
    const redis = getClient();
    if (!redis) return false;

    const fullKey = `${NAMESPACE}:${key}`;
    await redis.del(fullKey);
    return true;
  } catch (error) {
    logger.error('Rate limit reset error:', error.message);
    return false;
  }
}

/**
 * 获取当前计数
 */
async function getCount(key) {
  try {
    const redis = getClient();
    if (!redis) return 0;

    const fullKey = `${NAMESPACE}:${key}`;
    const count = await redis.get(fullKey);
    return parseInt(count || '0', 10);
  } catch (error) {
    logger.error('Rate limit getCount error:', error.message);
    return 0;
  }
}

module.exports = {
  checkLimit,
  createRateLimiter,
  reset,
  getCount
};
