#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {compareActivationReviews}=require('../src/ai/evaluation/activationReviews');
if(process.argv.length!==3){console.error('用法: node scripts/compareActivationReviews.js <评测文件.json>');process.exitCode=1;}
else try{
 const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 process.stdout.write(JSON.stringify(compareActivationReviews(input.cases),null,2)+'\n');
}catch(error){console.error(error.message);process.exitCode=1;}
