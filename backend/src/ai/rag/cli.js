#!/usr/bin/env node

/**
 * RAG CLI - Command-line tool for managing RAG knowledge base
 *
 * Usage:
 *   node src/ai/rag/cli.js init              - Initialize vector database
 *   node src/ai/rag/cli.js index findings    - Index historical findings
 *   node src/ai/rag/cli.js index all         - Re-index everything
 *   node src/ai/rag/cli.js search <query>    - Search knowledge base
 *   node src/ai/rag/cli.js stats             - Show statistics
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { getRAGSystem, KnowledgeIndexer, KnowledgeRetriever } = require('./index');

const logger = {
  info: (...args) => console.log('\x1b[36m[INFO]\x1b[0m', ...args),
  success: (...args) => console.log('\x1b[32m✓\x1b[0m', ...args),
  error: (...args) => console.error('\x1b[31m✗\x1b[0m', ...args),
  warn: (...args) => console.warn('\x1b[33m!\x1b[0m', ...args)
};

async function init() {
  try {
    logger.info('Initializing RAG system...');
    const rag = getRAGSystem();
    await rag.initialize();
    logger.success('RAG system initialized successfully');
  } catch (error) {
    logger.error('Initialization failed:', error.message);
    process.exit(1);
  }
}

async function indexFindings(limit = 1000) {
  try {
    logger.info(`Indexing historical findings (limit: ${limit})...`);
    const indexer = new KnowledgeIndexer();
    const count = await indexer.indexFindings(limit);
    logger.success(`Indexed ${count} findings`);
  } catch (error) {
    logger.error('Indexing failed:', error.message);
    process.exit(1);
  }
}

async function indexAnnotations(limit = 500) {
  try {
    logger.info(`Indexing human annotations (limit: ${limit})...`);
    const indexer = new KnowledgeIndexer();
    const count = await indexer.indexAnnotations(limit);
    logger.success(`Indexed ${count} annotations`);
  } catch (error) {
    logger.error('Indexing failed:', error.message);
    process.exit(1);
  }
}

async function indexAll() {
  try {
    logger.info('Re-indexing all knowledge...');
    const indexer = new KnowledgeIndexer();
    const stats = await indexer.reindexAll();
    logger.success('Re-index complete:');
    console.log(`  Findings: ${stats.findings}`);
    console.log(`  Annotations: ${stats.annotations}`);
  } catch (error) {
    logger.error('Re-index failed:', error.message);
    process.exit(1);
  }
}

async function search(query) {
  try {
    if (!query) {
      logger.error('Query is required');
      console.log('Usage: node src/ai/rag/cli.js search "<your query>"');
      process.exit(1);
    }

    logger.info(`Searching for: "${query}"`);
    const retriever = new KnowledgeRetriever();
    const context = await retriever.retrieveContext(query, {
      maxFindings: 3,
      maxAnnotations: 2,
      maxDocuments: 2
    });

    console.log('\n=== Search Results ===\n');

    if (context.findings.length > 0) {
      console.log('Findings:');
      context.findings.forEach((finding, idx) => {
        console.log(`  ${idx + 1}. [${finding.date}] ${finding.metric}`);
        console.log(`     变化: ${finding.changePercent}%`);
        console.log(`     相似度: ${(finding.score * 100).toFixed(1)}%`);
        if (finding.evidence?.conclusion) {
          console.log(`     结论: ${finding.evidence.conclusion}`);
        }
        console.log();
      });
    }

    if (context.annotations.length > 0) {
      console.log('Annotations:');
      context.annotations.forEach((ann, idx) => {
        console.log(`  ${idx + 1}. ${ann.annotation}`);
        console.log(`     正确性: ${ann.correctness}`);
        console.log(`     相似度: ${(ann.score * 100).toFixed(1)}%`);
        console.log();
      });
    }

    if (context.documents.length > 0) {
      console.log('Documents:');
      context.documents.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. ${doc.title}`);
        console.log(`     ${doc.text.substring(0, 100)}...`);
        console.log(`     相似度: ${(doc.score * 100).toFixed(1)}%`);
        console.log();
      });
    }

    if (context.totalResults === 0) {
      logger.warn('No results found');
    } else {
      logger.success(`Found ${context.totalResults} total results`);
    }
  } catch (error) {
    logger.error('Search failed:', error.message);
    process.exit(1);
  }
}

async function stats() {
  try {
    logger.info('Fetching RAG statistics...');
    const rag = getRAGSystem();
    await rag.initialize();
    const stats = await rag.getStats();

    console.log('\n=== RAG System Statistics ===\n');
    console.log(`Initialized: ${stats.initialized ? 'Yes' : 'No'}`);
    console.log(`Healthy: ${stats.healthy ? 'Yes' : 'No'}`);
    console.log(`Points Count: ${stats.pointsCount || 0}`);
    console.log(`Vectors Count: ${stats.vectorsCount || 0}`);
    console.log(`Status: ${stats.status || 'Unknown'}`);

    if (stats.error) {
      console.log(`Error: ${stats.error}`);
    }
  } catch (error) {
    logger.error('Stats failed:', error.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
RAG CLI - Knowledge Base Management Tool

Usage:
  node src/ai/rag/cli.js <command> [options]

Commands:
  init                      Initialize vector database
  index findings [limit]    Index historical findings (default: 1000)
  index annotations [limit] Index human annotations (default: 500)
  index all                 Re-index everything
  search "<query>"          Search knowledge base
  stats                     Show system statistics
  help                      Show this help message

Examples:
  node src/ai/rag/cli.js init
  node src/ai/rag/cli.js index findings 500
  node src/ai/rag/cli.js search "用户留存率下降"
  node src/ai/rag/cli.js stats
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const subcommand = args[1];

  switch (command) {
    case 'init':
      await init();
      break;

    case 'index':
      if (subcommand === 'findings') {
        const limit = parseInt(args[2], 10) || 1000;
        await indexFindings(limit);
      } else if (subcommand === 'annotations') {
        const limit = parseInt(args[2], 10) || 500;
        await indexAnnotations(limit);
      } else if (subcommand === 'all') {
        await indexAll();
      } else {
        logger.error(`Unknown index subcommand: ${subcommand}`);
        console.log('Available: findings, annotations, all');
        process.exit(1);
      }
      break;

    case 'search':
      const query = args.slice(1).join(' ');
      await search(query);
      break;

    case 'stats':
      await stats();
      break;

    default:
      logger.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  logger.error('CLI error:', error);
  process.exit(1);
});
