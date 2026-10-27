const express = require('express');
const router = express.Router();
const { getRAGSystem, KnowledgeIndexer, KnowledgeRetriever } = require('../ai/rag');
const logger = require('../utils/logger');

// Middleware to check if RAG is enabled
async function requireRAG(req, res, next) {
  try {
    const rag = getRAGSystem();
    const isEnabled = await rag.isEnabled();

    if (!isEnabled) {
      return res.status(503).json({
        error: 'RAG system is not available',
        message: 'Vector database or embeddings service not configured'
      });
    }

    req.rag = rag;
    next();
  } catch (error) {
    logger.error('RAG middleware error:', error);
    res.status(500).json({ error: 'RAG system error' });
  }
}

/**
 * GET /api/rag/health
 * RAG system health check
 */
router.get('/health', async (req, res) => {
  try {
    const rag = getRAGSystem();
    const stats = await rag.getStats();

    res.json({
      ok: stats.healthy,
      ...stats
    });
  } catch (error) {
    logger.error('RAG health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rag/stats
 * Get RAG system statistics
 */
router.get('/stats', requireRAG, async (req, res) => {
  try {
    const stats = await req.rag.getStats();

    res.json(stats);
  } catch (error) {
    logger.error('Get RAG stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/index/findings
 * Index historical findings
 * Body: { limit?: number }
 */
router.post('/index/findings', requireRAG, async (req, res) => {
  try {
    const { limit = 1000 } = req.body;

    const indexer = new KnowledgeIndexer();
    const count = await indexer.indexFindings(limit);

    res.json({
      success: true,
      indexed: count,
      message: `Indexed ${count} findings`
    });
  } catch (error) {
    logger.error('Index findings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/index/annotations
 * Index human annotations
 * Body: { limit?: number }
 */
router.post('/index/annotations', requireRAG, async (req, res) => {
  try {
    const { limit = 500 } = req.body;

    const indexer = new KnowledgeIndexer();
    const count = await indexer.indexAnnotations(limit);

    res.json({
      success: true,
      indexed: count,
      message: `Indexed ${count} annotations`
    });
  } catch (error) {
    logger.error('Index annotations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/index/documents
 * Index custom documents
 * Body: { documents: [{title, content, metadata}] }
 */
router.post('/index/documents', requireRAG, async (req, res) => {
  try {
    const { documents } = req.body;

    if (!Array.isArray(documents)) {
      return res.status(400).json({ error: 'documents must be an array' });
    }

    const indexer = new KnowledgeIndexer();
    const count = await indexer.indexDocuments(documents);

    res.json({
      success: true,
      indexed: count,
      message: `Indexed ${count} documents`
    });
  } catch (error) {
    logger.error('Index documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/index/all
 * Re-index everything
 */
router.post('/index/all', requireRAG, async (req, res) => {
  try {
    const indexer = new KnowledgeIndexer();
    const stats = await indexer.reindexAll();

    res.json({
      success: true,
      stats,
      message: 'Re-index completed'
    });
  } catch (error) {
    logger.error('Re-index all error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/search/findings
 * Search for similar findings
 * Body: { query, limit?, metric?, dateFrom?, dateTo?, scoreThreshold? }
 */
router.post('/search/findings', requireRAG, async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const retriever = new KnowledgeRetriever();
    const results = await retriever.retrieveSimilarFindings(query, options);

    res.json({
      query,
      results,
      count: results.length
    });
  } catch (error) {
    logger.error('Search findings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/search/annotations
 * Search for similar annotations
 * Body: { query, limit?, scoreThreshold? }
 */
router.post('/search/annotations', requireRAG, async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const retriever = new KnowledgeRetriever();
    const results = await retriever.retrieveSimilarAnnotations(query, options);

    res.json({
      query,
      results,
      count: results.length
    });
  } catch (error) {
    logger.error('Search annotations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/search/documents
 * Search for similar documents
 * Body: { query, limit?, scoreThreshold? }
 */
router.post('/search/documents', requireRAG, async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const retriever = new KnowledgeRetriever();
    const results = await retriever.retrieveDocuments(query, options);

    res.json({
      query,
      results,
      count: results.length
    });
  } catch (error) {
    logger.error('Search documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/retrieve
 * Retrieve all relevant context for a query
 * Body: { query, maxFindings?, maxAnnotations?, maxDocuments? }
 */
router.post('/retrieve', requireRAG, async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const retriever = new KnowledgeRetriever();
    const context = await retriever.retrieveContext(query, options);

    res.json({
      query,
      context,
      totalResults: context.totalResults
    });
  } catch (error) {
    logger.error('Retrieve context error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/prompt-context
 * Get formatted prompt context for a query
 * Body: { query, maxFindings?, maxAnnotations?, maxDocuments? }
 */
router.post('/prompt-context', requireRAG, async (req, res) => {
  try {
    const { query, ...options } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const retriever = new KnowledgeRetriever();
    const context = await retriever.retrieveContext(query, options);
    const promptContext = retriever.buildPromptContext(context);

    res.json({
      query,
      context: promptContext,
      totalResults: context.totalResults
    });
  } catch (error) {
    logger.error('Build prompt context error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
