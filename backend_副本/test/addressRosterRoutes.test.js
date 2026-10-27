const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),remote=require('../src/data/hologres')
test('address resolution endpoint requires authentication, reports conflicts and does not write tags',async()=>{
 const query=remote.query,status=remote.status,router=express.Router(),address='0x'+'a'.repeat(40)
 remote.status=async()=>({snapshot_cutoff:'2026-10-17',snapshot_id:'test'})
 remote.query=async()=>[{address,user_id:'123',source:'platform'},{address,user_id:'123',source:'login'}]
 require('../src/routes/activityImport')(router,{db:new Proxy({},{get(){throw Error('resolution must not write local data')}}),wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)})
 const app=express();app.use(express.json());app.use('/api/activities',(req,res,next)=>{if(req.get('authorization')!=='Bearer test')return res.status(401).json({error:'未登录'});req.user={user_id:'owner'};next()},router);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 const post=(addresses,token=true)=>fetch('http://127.0.0.1:'+server.address().port+'/api/activities/resolve-addresses',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer test'}:{})},body:JSON.stringify({addresses})})
 try{assert.equal((await post(address,false)).status,401);assert.equal((await post('bad')).status,400);const response=await post(address),result=await response.json();assert.equal(response.status,200);assert.deepEqual(result.user_ids,['123']);assert.deepEqual(result.records[0].sources,['login','platform'])}
 finally{remote.query=query;remote.status=status;await new Promise(r=>server.close(r))}
})
