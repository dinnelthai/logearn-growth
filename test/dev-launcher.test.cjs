const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {EventEmitter}=require('node:events');
const {checkPort,startServices}=require('../scripts/dev.cjs');

test('port check rejects an occupied port',async()=>{
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(checkPort(server.address().port),/已被占用/)}finally{await new Promise(resolve=>server.close(resolve))}
});
test('a failed service stops the other owned services',()=>{
 const children=[];const spawn=()=>{const child=new EventEmitter();child.pid=100+children.length;child.killed=false;child.kill=signal=>{child.killed=signal;return true};children.push(child);return child};
 let status;startServices({spawn,onExit:code=>{status=code},log:()=>{}});
 children[0].emit('exit',1,null);
 assert.equal(status,1);assert.equal(children[1].killed,'SIGTERM');assert.equal(children[2].killed,'SIGTERM');
});
test('Redis tunnel config requires explicit destination and uses configured local port',()=>{
 const {redisTunnelConfig}=require('../scripts/dev.cjs');
 assert.deepEqual(redisTunnelConfig({BULL_REDIS_URL:'redis://127.0.0.1:16379',REDIS_SSH_TARGET:'dev-host',REDIS_SSH_REMOTE_HOST:'redis.internal',REDIS_SSH_REMOTE_PORT:'6379'}),{port:16379,target:'dev-host',remoteHost:'redis.internal',remotePort:6379});
 assert.throws(()=>redisTunnelConfig({BULL_REDIS_URL:'redis://127.0.0.1:16379'}),/REDIS_SSH_TARGET/);
 assert.equal(redisTunnelConfig({BULL_REDIS_URL:'redis://redis.internal:6379'}),null);
});
test('occupied development port is released before startup',async()=>{
 const {spawn}=require('node:child_process');
 const {releasePort}=require('../scripts/dev.cjs');
 const child=spawn(process.execPath,['-e',"require('net').createServer().listen(0,'127.0.0.1',function(){console.log(this.address().port)})"],{stdio:['ignore','pipe','inherit']});
 const port=await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',data=>resolve(Number(String(data).trim())))});
 try{await releasePort(port);await checkPort(port)}finally{child.kill()}
});
test('old backend cleanup rejects an unrelated listener without stopping it',async()=>{
 const {releaseOldBackend}=require('../scripts/dev.cjs');
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(releaseOldBackend(server.address().port),/其他程序占用/);assert.equal(server.listening,true)}finally{await new Promise(resolve=>server.close(resolve))}
});
