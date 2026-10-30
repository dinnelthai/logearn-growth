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
function redisTunnelConfig(env){
 const url=new URL(env.BULL_REDIS_URL||env.REDIS_URL||'redis://localhost:6379');
 if(!['127.0.0.1','localhost'].includes(url.hostname))return null;
 const target=env.REDIS_SSH_TARGET,remoteHost=env.REDIS_SSH_REMOTE_HOST,remotePort=Number(env.REDIS_SSH_REMOTE_PORT);
 if(!target||!remoteHost||!Number.isInteger(remotePort)||remotePort<1||remotePort>65535)throw Error('Redis 未连接；请启动 Redis，或配置 REDIS_SSH_TARGET、REDIS_SSH_REMOTE_HOST 和 REDIS_SSH_REMOTE_PORT');
 if(target.startsWith('-')||!/^[\w.@-]+$/.test(target)||!/^[\w.-]+$/.test(remoteHost))throw Error('Redis SSH 隧道配置无效');
 return {port:Number(url.port||6379),target,remoteHost,remotePort};
}
function canConnect(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false)})})}
async function startRedisTunnel(env){
 const url=new URL(env.BULL_REDIS_URL||env.REDIS_URL||'redis://localhost:6379');
 if(!['127.0.0.1','localhost'].includes(url.hostname)||await canConnect(Number(url.port||6379)))return null;
 let child;
 if(env.REDIS_SSH_TARGET||env.REDIS_SSH_REMOTE_HOST||env.REDIS_SSH_REMOTE_PORT){
  const config=redisTunnelConfig(env);
  console.log('[Redis] 正在建立 SSH 隧道');
  child=spawn('ssh',['-N','-o','ExitOnForwardFailure=yes','-o','BatchMode=yes','-L',`127.0.0.1:${config.port}:${config.remoteHost}:${config.remotePort}`,config.target],{stdio:'inherit'});
 }else{
  if(url.username||url.password||url.protocol!=='redis:')throw Error('Redis 配置需要认证或 TLS，请启动配置的 Redis 服务或提供 SSH 隧道配置');
  const dir=path.join(root,'backend','.dev-redis');fs.mkdirSync(dir,{recursive:true});
  console.log('[Redis] 启动本地开发 Redis（数据与远程 Redis 独立）');
  const localRedis=path.join(require('node:os').homedir(),'.local','bin','redis-server');
  child=spawn(fs.existsSync(localRedis)?localRedis:'redis-server',['--bind','127.0.0.1','--port',String(url.port||6379),'--dir',dir,'--appendonly','yes'],{stdio:'inherit'});
 }
 let failure;child.once('error',error=>{failure=error});child.once('exit',()=>{failure=failure||new Error('SSH 隧道进程已退出')});
 for(let i=0;i<50;i++){if(failure)break;if(await canConnect(Number(url.port||6379)))return child;await new Promise(resolve=>setTimeout(resolve,100))}
 child.kill('SIGTERM');throw Error(`Redis 启动失败：${failure?.message||'连接超时'}（请检查是否安装 redis-server）`);
}
async function startLocalAiDatabase(env){
 if(!env.AI_DATABASE_URL)return;
 const url=new URL(env.AI_DATABASE_URL);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||Number(url.port||5432)!==15432||await canConnect(15432))return;
 const runtime=path.join(root,'backend','data','dev-runtime');
 const ctl=path.join(runtime,'postgres','bin','pg_ctl'),data=path.join(runtime,'pgdata'),socket=path.join(runtime,'pgsocket');
 if(!fs.existsSync(ctl)||!fs.existsSync(path.join(data,'PG_VERSION')))throw Error('本地 AI 数据库未运行，且未找到已有 PostgreSQL 程序或数据目录');
 fs.mkdirSync(socket,{recursive:true});
 console.log('[PostgreSQL] 启动已有本地 AI 数据库');
 const quotedSocket='"'+socket.replace(/(["\\])/g,'\\$1')+'"';
 execFileSync(ctl,['-D',data,'-l',path.join(runtime,'postgres.log'),'-o',`-h 127.0.0.1 -p 15432 -k ${quotedSocket}`,'start'],{stdio:'inherit'});
 if(!await canConnect(15432))throw Error('本地 AI 数据库启动后无法连接');
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
 await startLocalAiDatabase({...env,...process.env});
 await releaseOldBackend(port);
 await checkPort(port);
 const tunnel=await startRedisTunnel({...env,...process.env});
 console.log('启动后端、AI Worker 和前端；按 Ctrl+C 停止。');
 const services=startServices({skipWorker:existingWorker(),onExit:code=>{if(tunnel&&!tunnel.killed)tunnel.kill('SIGTERM');process.exitCode=code}});
 const stop=()=>{services.stop(0);if(tunnel&&!tunnel.killed)tunnel.kill('SIGTERM')};
 if(tunnel)tunnel.once('exit',()=>{if(!tunnel.killed){console.error('[Redis] 连接服务已退出');services.stop(1)}});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={checkPort,startServices,isProjectBackend,redisTunnelConfig};
