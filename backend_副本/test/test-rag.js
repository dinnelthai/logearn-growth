/**
 * RAG System Test
 * Tests vector database, embeddings, and knowledge retrieval
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  getRAGSystem,
  KnowledgeIndexer,
  KnowledgeRetriever,
  createEmbeddings,
  createVectorDB
} = require('../src/ai/rag');

const logger = {
  info: (...args) => console.log('\x1b[36m[INFO]\x1b[0m', ...args),
  success: (...args) => console.log('\x1b[32m[SUCCESS]\x1b[0m', ...args),
  error: (...args) => console.error('\x1b[31m[ERROR]\x1b[0m', ...args),
  warn: (...args) => console.warn('\x1b[33m[WARN]\x1b[0m', ...args)
};

async function testEmbeddings() {
  logger.info('Testing embeddings generation...');

  try {
    const embeddings = createEmbeddings('openai');

    // Test single embedding
    const text = '用户活跃度下降了15%';
    logger.info(`Generating embedding for: "${text}"`);

    const vector = await embeddings.embed(text);

    if (Array.isArray(vector) && vector.length > 0) {
      logger.success(`✓ Single embedding generated (${vector.length} dimensions)`);
      logger.info(`  First 5 values: [${vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    } else {
      throw new Error('Invalid embedding vector');
    }

    // Test batch embeddings
    const texts = [
      '新用户注册数量增长',
      '付费转化率下降',
      '推荐来源用户活跃度高'
    ];

    logger.info(`Generating batch embeddings for ${texts.length} texts...`);
    const vectors = await embeddings.embedBatch(texts);

    if (vectors.length === texts.length) {
      logger.success(`✓ Batch embeddings generated (${vectors.length} vectors)`);
    } else {
      throw new Error('Batch embedding count mismatch');
    }

    return true;
  } catch (error) {
    logger.error('Embeddings test failed:', error.message);
    return false;
  }
}

async function testVectorDB() {
  logger.info('Testing vector database...');

  try {
    const vectordb = createVectorDB('qdrant');

    // Test initialization
    logger.info('Initializing vector database...');
    await vectordb.initialize();
    logger.success('✓ Vector database initialized');

    // Test health check
    const isHealthy = await vectordb.healthCheck();
    if (isHealthy) {
      logger.success('✓ Vector database health check passed');
    } else {
      throw new Error('Health check failed');
    }

    // Test stats
    const stats = await vectordb.getStats();
    logger.success('✓ Vector database stats retrieved');
    logger.info(`  Points count: ${stats.pointsCount || 0}`);
    logger.info(`  Status: ${stats.status}`);

    // Test upsert
    const embeddings = createEmbeddings('openai');
    const testText = '测试数据: 用户活跃度异常';
    const vector = await embeddings.embed(testText);

    const testPoints = [{
      id: `test-${Date.now()}`,
      vector,
      payload: {
        type: 'test',
        text: testText,
        date: new Date().toISOString()
      }
    }];

    await vectordb.upsert(testPoints);
    logger.success('✓ Test point inserted');

    // Test search
    const searchResults = await vectordb.search(vector, {
      limit: 3,
      scoreThreshold: 0.5
    });

    if (searchResults.length > 0) {
      logger.success(`✓ Vector search returned ${searchResults.length} results`);
      searchResults.forEach((result, idx) => {
        logger.info(`  ${idx + 1}. Score: ${(result.score * 100).toFixed(1)}% | ${result.payload.text}`);
      });
    }

    return true;
  } catch (error) {
    logger.error('Vector database test failed:', error.message);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
      logger.warn('Tip: Make sure Qdrant is running:');
      logger.warn('  docker run -d -p 6333:6333 qdrant/qdrant');
    }
    return false;
  }
}

async function testKnowledgeIndexer() {
  logger.info('Testing knowledge indexer...');

  try {
    const indexer = new KnowledgeIndexer();

    // Test indexing documents (no database required)
    const testDocuments = [
      {
        id: `doc-test-${Date.now()}-1`,
        title: '用户留存分析',
        content: '新用户7日留存率为45%，高于行业平均水平',
        metadata: {
          category: 'retention',
          date: '2026-10-20'
        }
      },
      {
        id: `doc-test-${Date.now()}-2`,
        title: '付费转化优化',
        content: '通过优化新手引导流程，付费转化率提升了12%',
        metadata: {
          category: 'conversion',
          date: '2026-10-15'
        }
      }
    ];

    logger.info(`Indexing ${testDocuments.length} test documents...`);
    const count = await indexer.indexDocuments(testDocuments);

    if (count === testDocuments.length) {
      logger.success(`✓ Indexed ${count} documents successfully`);
    } else {
      throw new Error('Document indexing count mismatch');
    }

    return true;
  } catch (error) {
    logger.error('Knowledge indexer test failed:', error.message);
    return false;
  }
}

async function testKnowledgeRetriever() {
  logger.info('Testing knowledge retriever...');

  try {
    const retriever = new KnowledgeRetriever();

    // Test document search
    const query = '如何提升用户留存率';
    logger.info(`Searching for: "${query}"`);

    const results = await retriever.retrieveDocuments(query, {
      limit: 3,
      scoreThreshold: 0.5
    });

    if (results.length > 0) {
      logger.success(`✓ Found ${results.length} relevant documents`);
      results.forEach((result, idx) => {
        logger.info(`  ${idx + 1}. ${result.title} (${(result.score * 100).toFixed(1)}%)`);
        logger.info(`     ${result.text.substring(0, 100)}...`);
      });
    } else {
      logger.warn('No results found (this is OK if no documents indexed yet)');
    }

    // Test context retrieval
    const context = await retriever.retrieveContext(query, {
      maxFindings: 2,
      maxAnnotations: 2,
      maxDocuments: 2
    });

    logger.success('✓ Context retrieved successfully');
    logger.info(`  Total results: ${context.totalResults}`);

    // Test prompt context building
    const promptContext = retriever.buildPromptContext(context);
    logger.success('✓ Prompt context built');
    logger.info(`  Context length: ${promptContext.length} characters`);

    return true;
  } catch (error) {
    logger.error('Knowledge retriever test failed:', error.message);
    return false;
  }
}

async function testRAGSystem() {
  logger.info('Testing RAG system...');

  try {
    const rag = getRAGSystem();

    // Test initialization
    await rag.initialize();
    logger.success('✓ RAG system initialized');

    // Test enabled check
    const isEnabled = await rag.isEnabled();
    if (isEnabled) {
      logger.success('✓ RAG system is enabled');
    } else {
      throw new Error('RAG system is not enabled');
    }

    // Test stats
    const stats = await rag.getStats();
    logger.success('✓ RAG system stats retrieved');
    logger.info(`  Initialized: ${stats.initialized}`);
    logger.info(`  Healthy: ${stats.healthy}`);
    if (stats.pointsCount !== undefined) {
      logger.info(`  Points count: ${stats.pointsCount}`);
    }

    return true;
  } catch (error) {
    logger.error('RAG system test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('\n=== RAG System Test Suite ===\n');

  const results = {
    embeddings: false,
    vectordb: false,
    indexer: false,
    retriever: false,
    system: false
  };

  // Test 1: Embeddings
  console.log('\n--- Test 1: Embeddings ---');
  results.embeddings = await testEmbeddings();

  // Test 2: Vector Database
  console.log('\n--- Test 2: Vector Database ---');
  results.vectordb = await testVectorDB();

  // Test 3: Knowledge Indexer
  console.log('\n--- Test 3: Knowledge Indexer ---');
  results.indexer = await testKnowledgeIndexer();

  // Test 4: Knowledge Retriever
  console.log('\n--- Test 4: Knowledge Retriever ---');
  results.retriever = await testKnowledgeRetriever();

  // Test 5: RAG System
  console.log('\n--- Test 5: RAG System ---');
  results.system = await testRAGSystem();

  // Summary
  console.log('\n=== Test Summary ===\n');
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([name, passed]) => {
    const icon = passed ? '✓' : '✗';
    const color = passed ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${icon} ${name}\x1b[0m`);
  });

  console.log(`\nPassed: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n\x1b[32m✓ All RAG tests passed!\x1b[0m\n');
    process.exit(0);
  } else {
    console.log('\n\x1b[31m✗ Some RAG tests failed\x1b[0m\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  logger.error('Test suite error:', error);
  process.exit(1);
});
