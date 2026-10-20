/**
 * 数据库读写分离连接池
 *
 * 架构:
 * - 主库 (写操作): status(), snapshot() 等少量写入
 * - 只读副本 (读操作): 所有分析查询
 *
 * 预期效果:
 * - 支持并发: 50 → 200+ 用户 (+300%)
 * - 主库负载减少 90%
 * - 查询延迟减少 20%
 */

const { Pool } = require('pg')

// ===================================================================
// 主库连接池 (写操作)
// ===================================================================
const writePool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 5,                        // 写操作较少，只需 5 个连接
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
  statement_timeout: 15000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
})

writePool.on('error', (err) => {
  console.error('[Write Pool] Unexpected error:', err)
})

console.log('[Write Pool] Initialized (max: 5 connections)')

// ===================================================================
// 只读副本连接池 (读操作)
// ===================================================================
const ENABLE_READ_REPLICA = process.env.PGHOST_REPLICA && process.env.ENABLE_READ_REPLICA !== 'false'

let readPool = null

if (ENABLE_READ_REPLICA) {
  readPool = new Pool({
    host: process.env.PGHOST_REPLICA,      // 只读副本地址
    port: parseInt(process.env.PGPORT_REPLICA || process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE_REPLICA || process.env.PGDATABASE,
    user: process.env.PGUSER_REPLICA || process.env.PGUSER,
    password: process.env.PGPASSWORD_REPLICA || process.env.PGPASSWORD,
    max: 20,                       // 读操作多，需要更多连接
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    statement_timeout: 15000,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  })

  readPool.on('error', (err) => {
    console.error('[Read Pool] Unexpected error:', err)
  })

  console.log('[Read Pool] Initialized (max: 20 connections, replica mode)')
} else {
  // 如果没有只读副本，读操作也用主库（连接数增加到 15）
  readPool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 15,                       // 单库模式，平衡读写
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    statement_timeout: 15000,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  })

  readPool.on('error', (err) => {
    console.error('[Read Pool] Unexpected error:', err)
  })

  console.log('[Read Pool] Initialized (max: 15 connections, single-db mode)')
}

// ===================================================================
// 连接池统计
// ===================================================================
const stats = {
  readQueries: 0,
  writeQueries: 0,
  readErrors: 0,
  writeErrors: 0,
}

/**
 * 执行读查询
 * @param {string} sql - SQL 查询
 * @param {Array} params - 参数
 * @returns {Promise<any>}
 */
async function read(sql, params = []) {
  stats.readQueries++

  try {
    const result = await readPool.query(sql, params)
    return result
  } catch (error) {
    stats.readErrors++
    console.error('[Read Pool] Query error:', error.message)
    throw error
  }
}

/**
 * 执行写查询
 * @param {string} sql - SQL 查询
 * @param {Array} params - 参数
 * @returns {Promise<any>}
 */
async function write(sql, params = []) {
  stats.writeQueries++

  try {
    const result = await writePool.query(sql, params)
    return result
  } catch (error) {
    stats.writeErrors++
    console.error('[Write Pool] Query error:', error.message)
    throw error
  }
}

/**
 * 获取读连接池（兼容旧代码）
 * @returns {Pool}
 */
function getReadPool() {
  return readPool
}

/**
 * 获取写连接池（兼容旧代码）
 * @returns {Pool}
 */
function getWritePool() {
  return writePool
}

/**
 * 获取统计信息
 */
function getStats() {
  return {
    ...stats,
    readPool: {
      totalCount: readPool.totalCount,
      idleCount: readPool.idleCount,
      waitingCount: readPool.waitingCount,
    },
    writePool: {
      totalCount: writePool.totalCount,
      idleCount: writePool.idleCount,
      waitingCount: writePool.waitingCount,
    },
    mode: ENABLE_READ_REPLICA ? 'replica' : 'single-db',
  }
}

/**
 * 健康检查
 */
async function healthCheck() {
  try {
    // 检查读连接池
    const readResult = await readPool.query('SELECT 1 AS ok')
    if (readResult.rows[0].ok !== 1) {
      throw new Error('Read pool health check failed')
    }

    // 检查写连接池
    const writeResult = await writePool.query('SELECT 1 AS ok')
    if (writeResult.rows[0].ok !== 1) {
      throw new Error('Write pool health check failed')
    }

    return {
      status: 'healthy',
      mode: ENABLE_READ_REPLICA ? 'replica' : 'single-db',
      readPool: 'ok',
      writePool: 'ok',
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
    }
  }
}

/**
 * 关闭连接池
 */
async function close() {
  await Promise.all([
    readPool.end(),
    writePool.end(),
  ])
  console.log('[Pool] Closed')
}

// ===================================================================
// 导出
// ===================================================================

module.exports = {
  read,
  write,
  getReadPool,
  getWritePool,
  getStats,
  healthCheck,
  close,
}

// ===================================================================
// 使用示例
// ===================================================================

/**
 * 迁移指南:
 *
 * 旧代码:
 *   const { getPool } = require('./data/hologres')
 *   const pool = getPool()
 *   const result = await pool.query('SELECT ...')
 *
 * 新代码 (读操作):
 *   const { read } = require('./db/readWritePool')
 *   const result = await read('SELECT ...')
 *
 * 新代码 (写操作):
 *   const { write } = require('./db/readWritePool')
 *   await write('INSERT INTO ...')
 *
 * 兼容旧代码:
 *   const { getReadPool } = require('./db/readWritePool')
 *   const pool = getReadPool()
 *   const result = await pool.query('SELECT ...')
 */
