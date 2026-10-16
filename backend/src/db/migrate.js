const db = require('./connection')
const fs = require('fs')
const path = require('path')

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

// Split on semicolons and run each statement
db.exec(schema)

require('./upgradeActivities').upgradeActivities(db)
require('./upgradeActivities').upgradeCohorts(db)
require('./upgradeKolAccounts').upgradeKolAccounts(db)
console.log('Migration complete:', db.prepare('PRAGMA user_version').get().user_version)
