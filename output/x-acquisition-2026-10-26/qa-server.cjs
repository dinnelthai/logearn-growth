// Local visual QA: acquisition data is copied into memory; no credentials, sends or real writes.
process.env.DB_PATH=':memory:'
const path=require('node:path'),root=path.resolve(__dirname,'../..'),{DatabaseSync}=require('node:sqlite')
const express=require(path.join(root,'backend/node_modules/express')),db=require(path.join(root,'backend/src/db/connection'))
const provider=require(path.join(root,'backend/src/services/twitterApi'));provider.configured=()=>true
provider.search=async args=>{const id=args.beforeAttempt();args.settleAttempt(id,15);return {tweets:[],has_next_page:false,next_cursor:''}}
const {service}=require(path.join(root,'backend/src/services/xAcquisition'));const s=service()
const source=new DatabaseSync(path.join(root,'backend/data/analytics.db'),{readOnly:true})
const tables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'x_acq_%'").all()
for(const {name}of tables){if(!/^x_acq_[a-z_]+$/.test(name))throw Error('Unexpected table');const rows=source.prepare('SELECT * FROM '+name).all();for(const row of rows){const keys=Object.keys(row);db.prepare('INSERT OR REPLACE INTO '+name+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(row))}}
const owner=source.prepare('SELECT id FROM users LIMIT 1').get().id;source.close()
const app=express();app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5173');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, PUT');if(req.method==='OPTIONS')return res.sendStatus(204);next()});app.use(express.json());app.use((req,res,next)=>{req.user={user_id:owner};next()});app.use('/api/x-acquisition',require(path.join(root,'backend/src/routes/xAcquisition')));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'QA error'}));app.listen(3781,'127.0.0.1',()=>console.log('Memory-only acquisition QA ready on 3781'))
