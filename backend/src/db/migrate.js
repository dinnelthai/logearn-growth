const db = require('./connection')
const fs = require('fs')
const path = require('path')

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

// Split on semicolons and run each statement
schema.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => {
  db.exec(stmt)
})

console.log('Migration complete:', db.pragma('user_version', { simple: true }))
