require('dotenv').config({path:require('node:path').join(__dirname,'../../.env'),quiet:true})
require('./refresh').refresh().then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>require('../data/hologres').close())
