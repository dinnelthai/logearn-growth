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
    // Migrations are never an implicit recovery step for a missing AI table.
    // Requiring an explicit target name protects against mistaken write targets.
    const expected = process.env.AI_DATABASE_EXPECTED_NAME;
    if (process.env.AI_MIGRATION_APPROVED !== '1' || !process.env.AI_DATABASE_URL ||
        !expected || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(expected)) {
      throw new Error('AI 迁移未授权：需独立 AI_DATABASE_URL、AI_DATABASE_EXPECTED_NAME 及 AI_MIGRATION_APPROVED=1');
    }
    const identity = await pool.query('SELECT current_database() AS database_name');
    if (identity.rows?.[0]?.database_name !== expected) {
      throw new Error('AI 迁移目标数据库身份不匹配，拒绝执行');
    }

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
