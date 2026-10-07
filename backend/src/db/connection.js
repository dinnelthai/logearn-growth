const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/analytics.db')

const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const db = new DatabaseSync(DB_PATH)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

module.exports = db
