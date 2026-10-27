#!/usr/bin/env node
/**
 * AI 表迁移脚本
 * 在 PostgreSQL 中创建 AI 分析相关表
 *
 * 使用方式:
 * node src/db/migrateAI.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const aiPool = require('./aiPool');

async function migrateAITables() {
  const pool = aiPool;

  console.log('Starting AI tables migration...');

  try {
    // 读取迁移 SQL
    const migrationPath = path.join(__dirname, 'migrations', '001_ai_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // 执行迁移
    await pool.query(sql);

    console.log('✅ AI tables created successfully');

    // 验证表是否创建成功
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'ai_%'
      ORDER BY table_name
    `);

    console.log('\n📊 Created tables:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // 验证视图
    const views = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name LIKE 'ai_%'
    `);

    if (views.rows.length > 0) {
      console.log('\n👁️  Created views:');
      views.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }

    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 主函数
if (require.main === module) {
  migrateAITables();
}

module.exports = { migrateAITables };
