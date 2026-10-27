const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite')
const remote=require('../src/data/hologres'),{parseAddresses,addressRosterSql,resolveAddresses}=require('../src/data/addressRoster')
const evm=c=>'0x'+c.repeat(40),sol='11111111111111111111111111111111'
test('address parsing normalizes EVM only, handles single-column files, invalid values and budgets',()=>{
 const r=parseAddresses('address\n"'+evm('A')+'"\n'+evm('a')+';'+sol+' invalid')
 assert.deepEqual(r.addresses,[evm('a'),sol]);assert.equal(r.duplicates,1);assert.deepEqual(r.invalid,['invalid'])
 assert.throws(()=>parseAddresses('123'),/有效/);assert.throws(()=>parseAddresses('a'.repeat(1024*1024+1)),/1MB/)
 assert.throws(()=>parseAddresses(Array.from({length:5001},(_,i)=>'0x'+i.toString(16).padStart(40,'0')).join('\n')),/5000/)
})
test('production lookup resolves verified login and active platform wallets, rejects ambiguity, future and unknown accounts',async()=>{
 const db=new DatabaseSync(':memory:'),query=remote.query,status=remote.status
 db.function('regexp',(pattern,value)=>value==null?0:Number(new RegExp(pattern).test(value)))
 db.exec('CREATE TABLE account_v2(account_id INTEGER,created_at TEXT);CREATE TABLE account_identity_v2(account_id INTEGER,subject TEXT,provider TEXT,verified INTEGER,created_at TEXT);CREATE TABLE wallet_v2(account_id INTEGER,address TEXT,status TEXT,created_at TEXT)')
 for(const id of [1,2])db.prepare('INSERT INTO account_v2 VALUES(?,?)').run(id,'2026-01-01')
 db.prepare('INSERT INTO account_v2 VALUES(?,?)').run(3,'2027-01-01')
 for(const row of [[1,'Test@Example.com','email',1,'2026-01-01'],[2,'unverified@example.com','email',0,'2026-01-01'],[1,'conflict@example.com','email',1,'2026-01-01'],[2,'conflict@example.com','email',1,'2026-01-01'],[1,evm('A'),'metamask',1,'2026-01-01'],[1,evm('b'),'metamask',0,'2026-01-01'],[2,evm('c'),'metamask',1,'2026-01-01'],[3,evm('d'),'metamask',1,'2026-01-01'],[1,evm('e'),'metamask',1,'2027-01-01']])db.prepare('INSERT INTO account_identity_v2 VALUES(?,?,?,?,?)').run(...row)
 for(const row of [[1,evm('a'),'active','2026-01-01'],[2,sol,'active','2026-01-01'],[1,evm('c'),'active','2026-01-01'],[1,evm('f'),'inactive','2026-01-01']])db.prepare('INSERT INTO wallet_v2 VALUES(?,?,?,?)').run(...row)
 remote.status=async()=>({snapshot_id:'test',snapshot_cutoff:'2026-10-17'})
 remote.query=async(sql,params)=>db.prepare(sql.replace(/public\./g,'').replace(/=ANY\(\$2::text\[\]\)/g,' IN (SELECT value FROM json_each($2))').replace(/::timestamptz|::text/g,'').replace(/([a-z_.]+) ~ ('[^']*')/g,(_,column,pattern)=>`regexp(${pattern},${column})`)).all({'$1':params[0],'$2':JSON.stringify(params[1])})
 try{const r=await resolveAddresses([evm('A'),sol,...['b','c','d','e','f'].map(evm)].join('\n'))
 assert.deepEqual(r.user_ids,['1','2']);assert.equal(r.matched,2);assert.equal(r.ambiguous,1);assert.equal(r.unmatched,4)
 assert.deepEqual(r.records[0].sources,['login','platform']);assert.equal(r.records.find(r=>r.address===evm('c')).user_id,null)
 const emails=await resolveAddresses('TEST@example.com unverified@example.com conflict@example.com');assert.deepEqual(emails.user_ids,['1']);assert.equal(emails.unmatched,1);assert.equal(emails.ambiguous,1);assert.deepEqual(emails.records[0].sources,['email']);assert(addressRosterSql().includes('verified=true'))
 }finally{remote.query=query;remote.status=status;db.close()}
})

test('emails normalize case, deduplicate and accept CSV headers',()=>{const r=parseAddresses('email\nTest@Example.com test@example.com bad@');assert.deepEqual(r.addresses,['test@example.com']);assert.equal(r.duplicates,1);assert.deepEqual(r.invalid,['bad@'])})
