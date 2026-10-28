'use strict';
const {spawn,execFileSync}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
function isProjectBackend({command,cwd}){
 return cwd===path.join(root,'backend')&&/^\S*node(?:\s+--watch)?\s+(?:src\/index\.js|\.\/src\/index\.js)$/.test(command.trim());
}
async function releaseOldBackend(port){
 let output;try{output=execFileSync('lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-t'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch(error){if(error.status===1)return;throw new Error('无法检查端口占用，请手动确认');}
 const pids=output.trim().split(/\s+/).filter(Boolean).map(Number);
 for(const pid of pids){
  let command,cwd;try{command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).trim();const files=execFileSync('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8'});cwd=files.split('\n').find(line=>line.startsWith('n'))?.slice(1)}catch{throw new Error(`无法确认端口 ${port} 的进程，请手动检查`)}
  if(!isProjectBackend({command,cwd}))throw new Error(`端口 ${port} 被其他程序占用，请手动检查`);
 }
 for(const pid of pids){console.log(`停止本项目旧后端（PID ${pid}）`);process.kill(pid,'SIGTERM')}
 for(let i=0;i<30;i++){try{await checkPort(port);return}catch{await new Promise(resolve=>setTimeout(resolve,100))}}
 throw new Error(`旧后端未能释放端口 ${port}，请检查其运行状态`);
}

function checkPort(port){
 return new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',error=>reject(new Error(`端口 ${port} 无法使用${error.code==='EADDRINUSE'?'（已被占用）':': '+error.code}`)));
  server.listen(port,'127.0.0.1',()=>server.close(resolve));
 });
}
function startServices({spawn:launch=spawn,onExit=code=>{process.exitCode=code},log=console.log,skipWorker=false}={}){
 const specs=[['后端','backend',['src/index.js']],['AI Worker','backend',['src/queues/workers/aiAnalysisWorker.js']],['前端','frontend',['node_modules/vite/bin/vite.js','--port','5173','--strictPort']]];
 const children=[];let stopping=false;
 function stop(code=0){if(stopping)return;stopping=true;for(const child of children)if(child.exitCode==null&&!child.killed)child.kill('SIGTERM');onExit(code)}
 for(const [name,dir,args] of specs){
  if(skipWorker&&name==='AI Worker'){log('[AI Worker] 已有本项目 Worker 正在运行，保持原进程');continue}
  const child=launch(process.execPath,args,{cwd:path.join(root,dir),env:process.env,stdio:['ignore','pipe','pipe']});children.push(child);
  for(const stream of [child.stdout,child.stderr])if(stream){let rest='';stream.setEncoding('utf8');stream.on('data',chunk=>{const lines=(rest+chunk).split('\n');rest=lines.pop();for(const line of lines)log(`[${name}] ${line}`)});stream.on('end',()=>{if(rest)log(`[${name}] ${rest}`)})}
  child.once('error',error=>{log(`[${name}] 启动失败: ${error.message}`);stop(1)});
  child.once('exit',(code,signal)=>{if(!stopping){log(`[${name}] 已退出 (${signal||code})`);stop(code||1)}});
 }
 return {stop,children};
}
function existingWorker(){
 const lines=execFileSync('ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n');
 for(const line of lines){const match=line.trim().match(/^(\d+)\s+\S*node\s+(?:\.\/)?src\/queues\/workers\/aiAnalysisWorker\.js$/);if(!match)continue;
  try{const files=execFileSync('lsof',['-a','-p',match[1],'-d','cwd','-Fn'],{encoding:'utf8'});if(files.split('\n').includes('n'+path.join(root,'backend')))return true}catch{}
 }
 return false;
}
async function main(){
 for(const dir of ['backend','frontend'])if(!fs.existsSync(path.join(root,dir,'node_modules')))throw Error(`${dir} 依赖未安装，请在该目录执行 npm install`);
 const env=require('dotenv').config({path:path.join(root,'backend/.env'),quiet:true,processEnv:{}}).parsed||{};
 const port=Number(process.env.PORT||env.PORT||3001);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('后端 PORT 配置无效');
 await checkPort(5173);
 await releaseOldBackend(port);
 await checkPort(port);
 console.log('启动后端、AI Worker 和前端；按 Ctrl+C 停止。');
 const services=startServices({skipWorker:existingWorker()});
 process.once('SIGINT',()=>services.stop(0));process.once('SIGTERM',()=>services.stop(0));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={checkPort,startServices,isProjectBackend};
