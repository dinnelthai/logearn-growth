#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {compareCases}=require('../src/ai/growth/efficiencyAudit');
function main(args=process.argv.slice(2)){
 const file=args[0];
 if(!file||args.length!==1)throw Error('Usage: node scripts/compareAgentEfficiency.js <paired-labeled-cases.json>');
 const raw=fs.readFileSync(path.resolve(file),'utf8');
 const cases=JSON.parse(raw);
 const out=compareCases(Array.isArray(cases)?cases:cases.cases);
 process.stdout.write(JSON.stringify(out,null,2)+'\n');
 return out;
}
if(require.main===module)try{main()}catch(error){console.error(error.message);process.exitCode=1}
module.exports={main};
