const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'backend/src/analytics')
function baseline(file,overrides={}){const filename=path.join(dir,'baseline.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(dir);const original=m.require.bind(m);m.require=id=>overrides[id]||original(id);m._compile(fs.readFileSync(path.join(__dirname,file),'utf8'),filename);return m.exports}
const oldPaths=baseline('paths-before.txt'),oldDiagnostics=baseline('diagnostics-before.txt'),old=baseline('insights-before.txt',{'./paths':oldPaths,'./pathDiagnostics':oldDiagnostics}).pathInsights,current=require(path.join(dir,'pathInsights')).pathInsights
const types=['app_open','login','token_click','token','chip','chip_drilldown','trade','callout_click']
function fixture(count,eventsPerUser){return Array.from({length:count},(_,i)=>({id:'u'+i,source:i%3?'direct':'x',events:Array.from({length:eventsPerUser},(_,j)=>({type:types[(j+i)%types.length],t:1000+j*1000,session_id:j%23===0?null:'s'+Math.floor(j/12),page_url:j%2?'/cn/solana/tokens/A':'/cn',device:i%2?'mobile':'desktop',ua:'Mozilla/5.0 Windows Chrome/156.0',properties:{}}))}))}
const users=fixture(50,100),snapshot={as_of:new Date(3000000).toISOString()},base={start:1000,end:90000,details:false},checks=[]
for(const options of [{},{path_start:'chip'},{path_start:'chip',path_direction:'before'},{path_stop:'trade'},{path_depth:7},{source:'x'},{start:30000,end:60000},{details:true}]){const body={...base,...options};assert.deepEqual(current(users,body,snapshot),old(users,body,snapshot));checks.push(options)}
const large=fixture(1000,150),body={start:0,end:200000,details:false},measure=fn=>{const at=performance.now(),r=fn(large,body,snapshot);return {ms:performance.now()-at,r}}
// Warm both implementations, then alternate order to reduce warmup bias.
old(users,base,snapshot);current(users,base,snapshot)
const timings={before:[],after:[]};let expected
for(let i=0;i<4;i++)for(const name of i%2?['after','before']:['before','after']){global.gc?.();const v=measure(name==='before'?old:current);timings[name].push(v.ms);if(!expected)expected=v.r;else assert.deepEqual(v.r,expected)}
const report={events:150000,sessions:expected.payload.sessions,parity_cases:checks,timings,mean_ms:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,v.reduce((a,b)=>a+b)/v.length])),scope:'Synthetic in-process analytics only; excludes database, queue, network and browser'}
fs.writeFileSync(path.join(__dirname,'benchmark.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
