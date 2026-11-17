'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {updateEnv,SETTINGS,costFromUsage,PRICES_PER_MILLION}
 =require('../scripts/configureGrowthLlm');

test('quoted relay prices are divided by one thousand for the backend unit',()=>{
 assert.equal(SETTINGS.AI_DEFAULT_MODEL,'gpt-6.1-terra');
 assert.equal(Number(SETTINGS.AI_RELAY_COST_PER_1K_INPUT)*1000,PRICES_PER_MILLION.input);
 assert.equal(Number(SETTINGS.AI_RELAY_COST_PER_1K_OUTPUT)*1000,PRICES_PER_MILLION.output);
 assert.ok(Math.abs(costFromUsage(80000,20000)-0.01197)<1e-10);
 assert.equal(SETTINGS.AI_MAX_DAILY_TOKENS,'100000');
 assert.equal(SETTINGS.AI_MAX_DAILY_COST,'0.10');
});
test('env update keeps secrets and Redis config, and is idempotent',()=>{
 const old='# database\nOPENAI_API_KEY=secret-value-not-printed\nREDIS_URL=redis://127.0.0.1:16379\n'+
  'AI_DEFAULT_MODEL=claude-sonnet-4-6\nAI_RELAY_COST_PER_1K_INPUT=0\n';
 const updated=updateEnv(old);
 assert.ok(updated.includes('OPENAI_API_KEY=secret-value-not-printed'));
 assert.ok(updated.includes('REDIS_URL=redis://127.0.0.1:16379'));
 assert.ok(updated.includes('AI_DEFAULT_MODEL=gpt-6.1-terra'));
 assert.ok(updated.includes('AI_RELAY_COST_PER_1K_OUTPUT=0.0003325'));
 assert.equal(updateEnv(updated),updated);
});
test('duplicate model settings are removed and CRLF is preserved',()=>{
 const old='AI_DEFAULT_MODEL=old\r\nAI_DEFAULT_MODEL=other\r\nOPENAI_API_KEY=secret\r\n';
 const updated=updateEnv(old);
 assert.equal((updated.match(/^AI_DEFAULT_MODEL=/gm)||[]).length,1);
 assert.equal(updated.includes('\r\n'),true);
 assert.equal(updated.replace(/\r\n/g,'').includes('\n'),false);
});
test('do not interpret the assumed estimate as zero-cost billing',()=>{
 assert.ok(costFromUsage(28,4)>0);
 assert.throws(()=>costFromUsage(-1,4),/Token/);
 assert.equal(SETTINGS.AI_COST_ALERT_THRESHOLD,'0.05');
});
