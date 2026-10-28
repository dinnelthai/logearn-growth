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
test('only a verified project backend is eligible for automatic restart',()=>{
 const {isProjectBackend}=require('../scripts/dev.cjs');
 assert.equal(isProjectBackend({command:'node src/index.js',cwd:require('node:path').resolve(__dirname,'../backend')}),true);
 assert.equal(isProjectBackend({command:'node src/index.js',cwd:'/tmp/other/backend'}),false);
 assert.equal(isProjectBackend({command:'node other.js',cwd:require('node:path').resolve(__dirname,'../backend')}),false);
});
