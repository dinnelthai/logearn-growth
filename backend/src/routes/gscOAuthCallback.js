'use strict';
// Public Google callback: local account association is derived ONLY from consumed OAuth state.
const express=require('express');
const {randomBytes}=require('node:crypto');
const {oauth}=require('../ai/growth/gscOAuth');
const router=express.Router();
router.get('/oauth/callback',async(req,res)=>{
 let status='error';
 try{
  if(req.query.error)throw Error('authorization_denied');
  await oauth.complete(req.query.state,req.query.code);
  status='connected';
 }catch(error){console.warn('[gsc-oauth] callback:',error.message)}
 res.set('Cache-Control','no-store');
 res.set('Referrer-Policy','no-referrer');
 res.set('X-Content-Type-Options','nosniff');
 res.set('X-Frame-Options','DENY');
 const nonce=randomBytes(16).toString('base64');
 res.set('Content-Security-Policy',"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; frame-ancestors 'none'");
 let origin;
 try{origin=oauth.frontendOrigin()}catch{return res.status(503).type('text/plain').send('Google OAuth 尚未配置完成')}
 const message=JSON.stringify({type:'logearn:gsc:oauth',status});
 const title=status==='connected'?'Google Search Console 已连接':'Google 授权未完成，请返回后台重试';
 res.type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Search Console</title><body><p>'+title+
  '</p><script nonce="'+nonce+'">if(window.opener){window.opener.postMessage('+message+','+JSON.stringify(origin)+');window.close()}</script></body></html>');
});
module.exports=router;
