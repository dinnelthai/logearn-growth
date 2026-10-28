#!/usr/bin/env node
'use strict';
// Run locally: node scripts/configureGrowthLlm.js [--dry-run]
// Never prints, uploads or overwrites OPENAI_API_KEY. No provider request.
// Prices below are USER-SUPPLIED relay-screen quotes from 2026-10-28,
// NOT independently verified settled charges; all values in USD.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');

const PRICES_PER_MILLION={input:0.0665,output:0.3325};
const SETTINGS=Object.freeze({
 AI_DEFAULT_MODEL:'gpt-6.1-terra',
 // The existing backend requires USD per THOUSAND tokens.
 AI_RELAY_COST_PER_1K_INPUT:String(PRICES_PER_MILLION.input/1000),
 AI_RELAY_COST_PER_1K_OUTPUT:String(PRICES_PER_MILLION.output/1000),
 AI_MAX_DAILY_COST:'0.10',
 AI_COST_ALERT_THRESHOLD:'0.05',
 AI_MAX_DAILY_TOKENS:'100000',
 AI_TASK_MAX_CALLS:'6',
 AI_TASK_MAX_TOKENS:'50000',
 AI_TASK_MAX_OUTPUT_TOKENS:'4096'
});

function updateEnv(existing,settings=SETTINGS){
 if(typeof existing!=='string')throw Error('原始 .env 内容无效');
 const newline=existing.includes('\r\n')?'\r\n':'\n';
 const seen=new Set();
 const lines=[];
 for(const line of existing.split(/\r?\n/)){
  const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if(!match||!Object.hasOwn(settings,match[1])){lines.push(line);continue}
  const key=match[1];
  if(seen.has(key))continue; // duplicate override from an older .env
  seen.add(key);
  lines.push(key+'='+settings[key]);
 }
 if(lines.at(-1)==='')lines.pop();
 const missing=Object.keys(settings).filter(key=>!seen.has(key));
 if(missing.length){
  lines.push('','# Growth LLM: Terra pricing from relay screenshot (2026-10-28); USD/1k tokens.');
  for(const key of missing)lines.push(key+'='+settings[key]);
 }
 return lines.join(newline)+newline;
}
function costFromUsage(input,output,settings=SETTINGS){
 if(![input,output].every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('Token 用量无效');
 return input*Number(settings.AI_RELAY_COST_PER_1K_INPUT)/1000+
  output*Number(settings.AI_RELAY_COST_PER_1K_OUTPUT)/1000;
}
function main(args=process.argv.slice(2)){
 if(args.includes('--help')){
  console.log('Usage: cd backend && node scripts/configureGrowthLlm.js [--dry-run]');
  return;
 }
 if(args.some(x=>x!=='--dry-run'))throw Error('仅支持 --dry-run');
 const file=path.join(__dirname,'..','.env');
 if(!fs.existsSync(file))throw Error('找不到 backend/.env；不会创建或猜测密钥');
 const stat=fs.lstatSync(file);
 if(!stat.isFile())throw Error('backend/.env 不是普通文件，不修改');
 const original=fs.readFileSync(file,'utf8');
 const keyLine=original.split(/\r?\n/).find(x=>/^\s*OPENAI_API_KEY\s*=/.test(x));
 if(!keyLine||!keyLine.split('=').slice(1).join('=').trim())
  throw Error('backend/.env 没有 OPENAI_API_KEY，停止以避免误以为配置完成');
 const updated=updateEnv(original);
 console.log('Model:',SETTINGS.AI_DEFAULT_MODEL);
 console.log('Quoted input/output price: $'+PRICES_PER_MILLION.input+' / $'+PRICES_PER_MILLION.output+' per 1M tokens');
 console.log('Backend input/output price: $'+SETTINGS.AI_RELAY_COST_PER_1K_INPUT+
  ' / $'+SETTINGS.AI_RELAY_COST_PER_1K_OUTPUT+' per 1K tokens');
 console.log('Daily limits: $'+SETTINGS.AI_MAX_DAILY_COST+' (estimated), '+
  SETTINGS.AI_MAX_DAILY_TOKENS+' tokens; alert $'+SETTINGS.AI_COST_ALERT_THRESHOLD);
 console.log('Example 100k input + 20k output tokens: $'+costFromUsage(100000,20000).toFixed(6));
 if(args.includes('--dry-run')){
  console.log('DRY RUN only: .env was not changed, API key will never be printed.');
  return;
 }
 if(updated===original){
  console.log('No change: settings already match the selected profile.');
  return;
 }
 const backup=file+'.backup-'+Date.now()+'-'+randomBytes(3).toString('hex');
 fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
 const tmp=file+'.tmp-'+process.pid+'-'+randomBytes(3).toString('hex');
 try{
  fs.writeFileSync(tmp,updated,{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,0o600);
 }catch(error){try{fs.unlinkSync(tmp)}catch{}throw error}
 console.log('Updated backend/.env; private backup created at '+path.basename(backup));
 console.log('Restart the Web backend and AI Worker to load the new environment.');
 console.log('IMPORTANT: provider billing may differ from the screenshot; reconcile with relay invoice.');
}
if(require.main===module){
 try{main()}catch(error){console.error('Growth LLM setup failed:',error.message);process.exitCode=1}
}
module.exports={SETTINGS,PRICES_PER_MILLION,updateEnv,costFromUsage,main};
