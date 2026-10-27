'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('follower collection endpoints await enqueue and do not serialize a Promise',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/routes/xAcquisition.js'),'utf8');
 assert.match(s,/json\(await followers\(\)\.start\(/);
 assert.match(s,/json\(await followers\(\)\.startAnalysis\(/);
});
