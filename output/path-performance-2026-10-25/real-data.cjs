const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'backend/src/analytics')
function baseline(file,overrides={}){const filename=path.join(dir,'baseline.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(dir);const original=m.require.bind(m);m.require=id=>overrides[id]||original(id);m._compile(fs.readFileSync(path.join(__dirname,file),'utf8'),filename);return m.exports}
const oldPaths=baseline('paths-before.txt'),oldDiagnostics=baseline('diagnostics-before.txt'),old=baseline('insights-before.txt',{'./paths':oldPaths,'./pathDiagnostics':oldDiagnostics}).pathInsights,current=require(path.join(dir,'pathInsights')).pathInsights

require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true})
const remote=require(path.join(root,'backend/src/data/hologres'))
;(async()=>{try{
 const snapshot=await remote.status(),body={start:Date.parse('2026-10-18T00:00:00+07:00'),end:Date.parse('2026-10-25T00:00:00+07:00'),source:'all',details:false}
 const at=performance.now(),users=await require(path.join(root,'backend/src/data/behaviorPaths')).pathUsers(snapshot,body,undefined,{graphOnly:true}),load=performance.now()-at
 const timings={before:[],after:[]};let expected
 for(let i=0;i<4;i++)for(const name of i%2?['after','before']:['before','after']){global.gc?.();const start=performance.now(),r=(name==='before'?old:current)(users,body,snapshot);timings[name].push(performance.now()-start);if(!expected)expected=r;else assert.deepEqual(r,expected)}
 const report={events:users.reduce((n,u)=>n+u.events.length,0),sessions:expected.payload.sessions,users:expected.payload.users,load_ms:load,timings,mean_ms:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,v.reduce((a,b)=>a+b)/v.length])),parity:true,scope:'Read-only single-snapshot real data; analytics timings exclude database, queue, network and browser'}
 fs.writeFileSync(path.join(__dirname,'real-data.json'),JSON.stringify(report,null,2));console.log(report)
 }catch(e){console.error(e.message);process.exitCode=1}finally{await remote.close()}})()
