const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
const {createRouter}=require('../src/routes/growthAgent');
test('authenticated foundation API ignores body owners and exposes goal history, tools and evidence',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 const app=require('express')();app.use(require('express').json());app.use((req,res,next)=>{req.user={user_id:'alice'};next()});
 app.use(createRouter({db,registry:{listCapabilities:()=>[{id:'get_paths'}],executeTool:async(_id,_input,c)=>({owner:c.ownerId})}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
 const response=await fetch(base+'/goals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'g',value:2,deadline:'2026-11-30',ownerId:'bob'})});assert.equal(response.status,201);
 const goal=await(await fetch(base+'/goals/g?version=1')).json();assert.equal(goal.value,2);
 const result=await(await fetch(base+'/tools/get_paths',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerId:'bob',period:{start:1,end:2}})})).json();assert.equal(result.owner,'alice');
 assert.equal((await fetch(base+'/evidence/nonexistent')).status,404);
 }finally{await new Promise(r=>server.close(r));db.close()}
});
