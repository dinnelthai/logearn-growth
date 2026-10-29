'use strict';
// Shared identity list for both the follower audit and official content channels.
const ACCOUNTS=Object.freeze([
 Object.freeze({id:'logearn_cn',label:'中文账号'}),
 Object.freeze({id:'logearn_global',label:'国际账号'})
]);
const valid=id=>ACCOUNTS.some(a=>a.id===id);
module.exports={ACCOUNTS,valid};
