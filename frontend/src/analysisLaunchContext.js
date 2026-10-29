// One-time, same-tab navigation handoff; never persist account data in URLs or storage.
// Only the receiving page decides whether the referenced record is authorized.
let pending=null;
export function queueAnalysisLaunch(value){
 pending=value&&typeof value==='object'?{...value}:null;
}
export function consumeAnalysisLaunch(){
 const result=pending;
 pending=null;
 return result;
}
