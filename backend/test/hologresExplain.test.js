'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {statusQueries,decodeFacet}=require('../src/data/hologres');
const {weeklyCoreQuery}=require('../src/data/weeklyCore');
const {workload,extract}=require('../scripts/explainHologres');
test('status optimized read-only query retains original facets and same CTE identity boundaries',()=>{
 const q=statusQueries();
 assert.equal(Object.keys(q).length,5);
 for(const sql of Object.values(q)){
  assert.match(sql,/PARTITION BY event_id/);
  assert.match(sql,/client_ts >= 0/);
  assert.match(sql,/server_ts <= \$1::timestamptz/);
  assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|DROP|CREATE TABLE/i);
 }
 assert.match(q.combined,/JSON_AGG/);
 assert.match(q.combined,/SELECT DISTINCT event_name/);
 assert.match(q.combined,/ORDER BY 1 LIMIT 100/);
 assert.deepEqual(decodeFacet('[{"event_name":"chip_analysis_viewed","module":null}]'),
  [{event_name:'chip_analysis_viewed',module:null}]);
 assert.throws(()=>decodeFacet(null),/array/);
 assert.match(weeklyCoreQuery(),/COUNT\(DISTINCT e.date\)/);
});
test('explain captures 4 legacy variants and 1 optional compact query without executing SQL',()=>{
 const rows=workload({cutoff:'2026-10-28T06:00:00.000Z',
  dayEnd:Date.parse('2026-10-26T17:00:00Z')});
 assert.deepEqual(rows.map(r=>r.name),['status-count','status-sources',
  'status-strategies','status-eventTypes','status-combined','weekly-core']);
 assert.ok(rows.every(x=>x.sql.startsWith('WITH ranked AS')));
 assert.deepEqual(extract([{Plan:{'Node Type':'Aggregate','Total Cost':12,
  Plans:[{'Node Type':'Seq Scan'}]}}],'status',false).planNodeTypes,['Aggregate','Seq Scan']);
});
