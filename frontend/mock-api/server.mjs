import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const externalRoutes={
  'users':              new URL('../src/api/users.json',import.meta.url),
  'events':             new URL('../src/api/events.json',import.meta.url),
  'trades':             new URL('../src/api/trades.json',import.meta.url),
  'logearn_user':       new URL('../src/api/logearn_user.json',import.meta.url),
  'logearn_user_referral': new URL('../src/api/logearn_user_referral.json',import.meta.url),
  'logearn_events':     new URL('../src/api/logearn_events.json',import.meta.url),
  'channels':           new URL('../src/channels/channels.json',import.meta.url),
};
createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Access-Control-Allow-Origin','*');
 if(req.method!=='GET'){res.writeHead(405);res.end(JSON.stringify({error:'只读 Mock，修改请用 Dashboard 内置演示模式'}));return;}
 const url=new URL(req.url,'http://localhost'),slug=url.pathname.replace(/^\/api\/analytics\//,''),filePath=externalRoutes[slug];
 if(!filePath){res.writeHead(404);res.end(JSON.stringify({error:'未提供此接口'}));return;}
 try{const value=JSON.parse(await readFile(filePath,'utf8'));
 if(slug==='events'){const start=url.searchParams.get('start'),end=url.searchParams.get('end');if(start||end)value.events=value.events.filter(row=>(!start||Date.parse(row.occurred_at)>=Date.parse(start))&&(!end||Date.parse(row.occurred_at)<Date.parse(end)));}
 if(slug==='trades'){const start=url.searchParams.get('start'),end=url.searchParams.get('end');if(start||end)value.trades=value.trades.filter(row=>(!start||Date.parse(row.confirmed_at)>=Date.parse(start))&&(!end||Date.parse(row.confirmed_at)<Date.parse(end)));}
 if(slug==='logearn_events'){const start=url.searchParams.get('start'),end=url.searchParams.get('end');if(start||end)value.logearn_events=value.logearn_events.filter(row=>(!start||row.client_ts>=Number(start))&&(!end||row.client_ts<Number(end)));}
 res.end(JSON.stringify(value));
 }catch{res.writeHead(500);res.end(JSON.stringify({error:'读取 Mock JSON 失败'}));}
}).listen(5174,'127.0.0.1',()=>console.log('Mock API: http://127.0.0.1:5174/api/analytics'));
