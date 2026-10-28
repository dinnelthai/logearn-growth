'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {getBullRedisConfig}=require('../src/queues/connection');
test('queue rejects HTTPS REST endpoints before opening a Redis connection',()=>{
 const old=process.env.REDIS_URL;process.env.REDIS_URL='https://example.invalid';try{assert.throws(()=>getBullRedisConfig(),/redis:\/\/.*rediss:\/\//)}finally{if(old===undefined)delete process.env.REDIS_URL;else process.env.REDIS_URL=old}
});
test('queue preserves TLS and username for rediss connections',()=>{
 const old=process.env.REDIS_URL;process.env.REDIS_URL='rediss://alice:secret@example.invalid:6380';try{const c=getBullRedisConfig();assert.deepEqual(c.tls,{});assert.equal(c.username,'alice');assert.equal(c.port,6380)}finally{if(old===undefined)delete process.env.REDIS_URL;else process.env.REDIS_URL=old}
});
test('a queue-specific Redis URL overrides the separate REST cache URL',()=>{
 const oldRest=process.env.REDIS_URL,oldQueue=process.env.BULL_REDIS_URL;process.env.REDIS_URL='https://example.invalid';process.env.BULL_REDIS_URL='redis://127.0.0.1:6391';
 try{assert.equal(getBullRedisConfig().port,6391)}finally{if(oldRest===undefined)delete process.env.REDIS_URL;else process.env.REDIS_URL=oldRest;if(oldQueue===undefined)delete process.env.BULL_REDIS_URL;else process.env.BULL_REDIS_URL=oldQueue}
});
