const {test}=require('node:test'),assert=require('node:assert/strict');
const {DAY,OFFSET,businessDay,returnD7FromDays}=require('../src/analytics/returnD7');
const at=(d,h=12)=>d*DAY-OFFSET+h*3600000;
test('7 complete UTC+7 empty days are required, and the return must be a core action',()=>{
 const opts={start:at(0),end:at(30)};
 assert.equal(returnD7FromDays([1,8],[at(8)],opts).returned,false);
 assert.equal(returnD7FromDays([1,9],[at(9)],opts).returned,true);
 assert.equal(returnD7FromDays([1,5,9],[at(9)],opts).returned,false);
 assert.equal(returnD7FromDays([1,9],[],opts).returned,false);
 assert.equal(returnD7FromDays([9],[at(9)],opts).returned,false);
 assert.equal(returnD7FromDays([1,9],[at(9)],opts).returns[0].blank_days,7);
});
test('a return before the selected period is not counted twice',()=>{
 assert.equal(returnD7FromDays([1,9],[at(9,9),at(9,15)],{start:at(9,10),end:at(10)}).returned,false);
 assert.equal(returnD7FromDays([1,9],[at(9,11)],{start:at(9,10),end:at(10)}).returned,true);
 const midnight=Date.UTC(2026,10,1,17);assert.equal(businessDay(midnight),businessDay(midnight-1)+1);
});

test('D7 SQL checks calendar gap and requires previous activity',()=>{
 const {returnD7Sql}=require('../src/data/returnD7')
 const sql=returnD7Sql()
 assert.match(sql,/LAG\(day_index\)/)
 assert.match(sql,/previous_day IS NOT NULL/)
 assert.match(sql,/day_index-previous_day>=8/)
 assert.match(sql,/first_core_ts>=\$3/)
})

test('segment SQL uses BIGINT[] instead of unsupported NUMERIC[] for active days',async()=>{
 const remote=require('../src/data/hologres');
 const {features}=require('../src/data/remoteUsers');
 const originalQuery=remote.query;
 let sql='';
 try{
  remote.query=async statement=>{sql=statement;return []};
  await features({snapshot_cutoff:'2026-11-16T10:00:00.000Z',as_of:'2026-11-16T10:00:00.000Z'},'all',[],{start:0,end:1});
 }finally{remote.query=originalQuery}
 assert.match(sql,/ARRAY_AGG\(DISTINCT FLOOR\(\(e\.client_ts\+25200000\)\/86400000\.0\)::BIGINT\)/);
 assert.doesNotMatch(sql,/ARRAY_AGG\(DISTINCT FLOOR\(\(e\.client_ts\+25200000\)\/86400000\.0\)\)/);
})
