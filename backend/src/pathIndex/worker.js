const {parentPort}=require('node:worker_threads')
require('./refresh').refresh().then(result=>parentPort.postMessage({result})).catch(error=>parentPort.postMessage({error:error.message})).finally(()=>require('../data/hologres').close())
