process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path'),db=require('../src/db/connection')
const dev=require('../src/middleware/localDevLogin')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run('existing','operator@example.com','unused:hash',1)
const app=express();app.use(express.json());app.use('/auth',require('../src/routes/auth'));const server=app.listen(0,'127.0.0.1')
after(()=>{delete process.env.LOCAL_DEV_LOGIN;delete process.env.NODE_ENV;server.close();db.close()})
async function request(url,method='GET',body,token){const response=await fetch('http://127.0.0.1:'+server.address().port+'/auth'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}
test('arbitrary local login reuses operator, keeps authenticated API access, and expires on disable',async()=>{
 process.env.LOCAL_DEV_LOGIN='true';process.env.NODE_ENV='development'
 const result=await request('/login','POST',{email:'anything',password:'1'});assert.equal(result.status,200);assert.equal(result.body.user.id,'existing');assert.ok(result.body.token.startsWith('dev-local-'))
 assert.equal((await request('/me','GET',null,result.body.token)).status,200)
 process.env.LOCAL_DEV_LOGIN='false';assert.equal((await request('/me','GET',null,result.body.token)).status,401)
 assert.equal((await request('/login','POST',{email:'anything',password:'1'})).status,401)
})
test('bypass rejects production, external hosts, nonlocal origins and nonloopback connections',()=>{
 process.env.LOCAL_DEV_LOGIN='true';process.env.NODE_ENV='development'
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3001',origin:'http://localhost:5173'}}
 assert.equal(dev.allowed(req),true)
 assert.equal(dev.allowed({...req,socket:{remoteAddress:'192.168.1.2'}}),false)
 assert.equal(dev.allowed({...req,headers:{host:'public.example.com'}}),false)
 assert.equal(dev.allowed({...req,headers:{host:'localhost:3001',origin:'https://public.example.com'}}),false)
 process.env.NODE_ENV='production';assert.equal(dev.allowed(req),false);assert.equal(dev.enabled(),false)
})
