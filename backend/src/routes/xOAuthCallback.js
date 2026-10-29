'use strict';
// Public callback: identity is recovered exclusively from a one-time PKCE state.
const express=require('express');
const {randomBytes}=require('node:crypto');
const {oauth}=require('../services/xOAuth');
const router=express.Router();
router.get('/oauth/callback',async(req,res)=>{
 let status='error';
 try{
  if(req.query.error)throw Error('authorization_denied');
  await oauth.complete(req.query.state,req.query.code);
  status='connected';
 }catch(error){console.warn('[x-oauth] callback:',error.message)}
 res.set('Cache-Control','no-store');
 res.set('Referrer-Policy','no-referrer');
 res.set('X-Content-Type-Options','nosniff');
 res.set('X-Frame-Options','DENY');
 const nonce=randomBytes(16).toString('base64');
 res.set('Content-Security-Policy',"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; frame-ancestors 'none'");
 let origin;
 try{origin=oauth.frontendOrigin()}
 catch{return res.status(503).type('text/plain').send('X OAuth 配置尚未完成')}
 const message=JSON.stringify({type:'logearn:x:oauth',status});
 const title=status==='connected'?'X 账号已连接':'X 授权未完成，请返回后台重试';
 res.type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>X 授权</title><body><p>'+title+
  '</p><script nonce="'+nonce+'">if(window.opener){window.opener.postMessage('+message+','+JSON.stringify(origin)+');window.close()}</script></body></html>');
});
module.exports=router;
