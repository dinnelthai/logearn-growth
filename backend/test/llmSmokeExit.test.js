const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('LLM smoke test closes its database pool after stale schema failure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llm-smoke-'));
 try {
  const preload=path.join(dir,'preload.js');
  fs.writeFileSync(preload,`const Module=require('node:module'); const load=Module._load; Module._load=function(name,...args){if(name==='pg')return {Pool:class {constructor(){this.timer=setInterval(()=>{},1000)} on(){return this} async query(){return {rows:[{}]}} async end(){clearInterval(this.timer)}}}; return load.call(this,name,...args)};`);
  const result=spawnSync(process.execPath,['-r',preload,path.join(__dirname,'../src/ai/llm/test.js')],{
   env:{...process.env,AI_DATABASE_URL:'postgresql://test@127.0.0.1/ai'},encoding:'utf8',timeout:10000
  });
  assert.equal(result.error,undefined,'smoke test must close its pool and exit');
  assert.equal(result.status,1);
  assert.match(result.stderr,/LLM smoke test failed/);
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
