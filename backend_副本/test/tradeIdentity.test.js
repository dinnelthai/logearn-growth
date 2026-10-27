const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite')
const {tradeIdentityCte}=require('../src/data/tradeIdentity')
test('trade identities remap verified legacy wallets and reject unverified collisions, ambiguity and future identities',()=>{
 const db=new DatabaseSync(':memory:'),cutoff='2026-10-14',before='2026-01-01',future='2027-01-01'
 // Execute the production identity CTE; translate only PostgreSQL cast/regex syntax.
 db.function('regexp',(pattern,value)=>value==null?0:Number(new RegExp(pattern).test(value)))
 db.exec('CREATE TABLE account_v2(account_id INTEGER,created_at TEXT);CREATE TABLE account_identity_v2(account_id INTEGER,subject TEXT,provider TEXT,verified INTEGER,created_at TEXT);CREATE TABLE user_account(id INTEGER,login_address TEXT,created_time TEXT);CREATE TABLE business_trades(user_id INTEGER)')
 const wallet=c=>'0x'+c.repeat(40)
 for(const id of [101,2,3,104,105,106])db.prepare('INSERT INTO account_v2 VALUES(?,?)').run(id,before)
 for(const [id,c,verified,created] of [[101,'a',1,before],[2,'b',0,before],[104,'c',1,before],[105,'c',1,before],[501,'d',1,before],[106,'e',1,future]])db.prepare('INSERT INTO account_identity_v2 VALUES(?,?,?,?,?)').run(id,wallet(c),'metamask',verified,created)
 for(const [id,c] of [[1,'A'],[2,'b'],[4,'c'],[5,'d'],[6,'e']])db.prepare('INSERT INTO user_account VALUES(?,?,?)').run(id,wallet(c),before)
 for(const id of [1,2,3,4,5,6])db.prepare('INSERT INTO business_trades VALUES(?)').run(id)
 const sql=tradeIdentityCte('SELECT user_id FROM business_trades').replace(/public\./g,'').replace(/::timestamptz/g,'').replace(/([a-z_.]+) ~ ('[^']*')/g,(_whole,column,pattern)=>`regexp(${pattern},${column})`)
 try{const rows=db.prepare(sql+' SELECT user_id,account_id FROM valid_map ORDER BY user_id').all({'$1':cutoff});assert.deepEqual(rows.map(r=>[r.user_id,r.account_id]),[[1,101],[3,3]])}finally{db.close()}
})
