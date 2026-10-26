#!/usr/bin/env node
// 添加新的 6 组中文关键词到 X 获客系统
// 用法: node scripts/addNewKeywords.js [owner_id]

const Database = require('better-sqlite3');
const path = require('path');
const {randomUUID} = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/analytics.db');
const OWNER_ID = process.argv[2] || 'leon'; // 默认 owner_id

// 新增的 6 组关键词
const NEW_KEYWORDS = [
  {name:'中文 · 链上工具推荐', query:'(链上工具 OR 链上分析 OR 数据工具) (推荐 OR 好用 OR 必备) -filter:retweets lang:zh'},
  {name:'中文 · MEME工具研究', query:'(MEME币 OR 土狗) (怎么查 OR 工具 OR 看板) (链上 OR 持仓 OR 风险) -filter:retweets lang:zh'},
  {name:'中文 · Token研究教学', query:'(代币研究 OR Token分析 OR 项目分析) (教程 OR 方法 OR 框架) -filter:retweets lang:zh'},
  {name:'中文 · 链上信号解读', query:'(链上信号 OR 链上指标) (怎么看 OR 解读 OR 分析) -filter:retweets lang:zh'},
  {name:'中文 · 交易工具求助', query:'(求推荐 OR 有没有好用的) (交易 OR 分析 OR 监控) (链上 OR 代币) lang:zh'},
  {name:'中文 · 数据看板', query:'(看板 OR 仪表盘 OR dashboard) (链上 OR 数据 OR 分析) (搭建 OR 工具) lang:zh'},
];

function main() {
  const db = new Database(DB_PATH);

  console.log('=== 添加新的 X 获客关键词 ===\n');
  console.log('数据库:', DB_PATH);
  console.log('Owner ID:', OWNER_ID);
  console.log('');

  try {
    // 检查当前关键词数量
    const current = db.prepare('SELECT COUNT(*) as n FROM x_acq_rules WHERE owner_id=?').get(OWNER_ID);
    console.log(`当前关键词数量: ${current.n}`);

    if (current.n >= 10) {
      console.error('错误: 已达到最大关键词数量限制（10组）');
      console.error('请先在前端停用或删除一些旧关键词');
      process.exit(1);
    }

    // 检查是否有采集任务正在运行
    const running = db.prepare("SELECT 1 FROM x_acq_runs WHERE state='running'").get();
    if (running) {
      console.error('错误: 有采集任务正在运行，请等待完成后再添加关键词');
      process.exit(1);
    }

    // 检查哪些关键词已存在
    const existing = db.prepare('SELECT name FROM x_acq_rules WHERE owner_id=?').all(OWNER_ID).map(r => r.name);
    const toAdd = NEW_KEYWORDS.filter(k => !existing.includes(k.name));

    if (toAdd.length === 0) {
      console.log('✓ 所有新关键词已存在，无需添加');
      return;
    }

    console.log(`\n将添加 ${toAdd.length} 组新关键词:\n`);
    toAdd.forEach((k, i) => console.log(`  ${i+1}. ${k.name}`));
    console.log('');

    // 批量插入
    const insert = db.prepare(`
      INSERT INTO x_acq_rules(id, owner_id, name, query, enabled, updated_at, cursor)
      VALUES(?, ?, ?, ?, 1, ?, '')
    `);

    const now = Date.now();
    db.transaction(() => {
      for (const keyword of toAdd) {
        const id = randomUUID();
        insert.run(id, OWNER_ID, keyword.name, keyword.query, now);
        console.log(`✓ 已添加: ${keyword.name}`);
      }
    })();

    // 显示最新状态
    const updated = db.prepare('SELECT COUNT(*) as n FROM x_acq_rules WHERE owner_id=?').get(OWNER_ID);
    console.log(`\n✓ 完成！当前关键词总数: ${updated.n}`);
    console.log('\n下一步:');
    console.log('  1. 重启后端服务（如果正在运行）');
    console.log('  2. 访问前端「X 获客」页面');
    console.log('  3. 点击「立即采集」触发新关键词搜索');

  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
