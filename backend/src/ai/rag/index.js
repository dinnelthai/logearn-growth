const { createEmbeddings } = require('./embeddings');
const { createVectorDB } = require('./vectordb');
const { KnowledgeIndexer, KnowledgeRetriever } = require('./knowledge');
const logger = require('../../utils/logger');

/**
 * RAG (Retrieval-Augmented Generation) System
 * Main entry point for RAG functionality
 */
class RAGSystem {
  constructor() {
    this.embeddings = createEmbeddings('openai');
    this.vectordb = createVectorDB('qdrant');
    this.indexer = new KnowledgeIndexer();
    this.retriever = new KnowledgeRetriever();
    this.initialized = false;
  }

  /**
   * Initialize RAG system
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.initialized) {
        logger.info('RAG system already initialized');
        return;
      }

      logger.info('Initializing RAG system...');

      // Initialize vector database
      await this.vectordb.initialize();

      // Check health
      const isHealthy = await this.vectordb.healthCheck();
      if (!isHealthy) {
        throw new Error('Vector database health check failed');
      }

      this.initialized = true;
      logger.info('RAG system initialized successfully');
    } catch (error) {
      logger.error('RAG system initialization error:', error);
      throw error;
    }
  }

  /**
   * Check if RAG is enabled and healthy
   * @returns {Promise<boolean>}
   */
  async isEnabled() {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return false;
    }

    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        logger.warn('RAG initialization failed:', error.message);
        return false;
      }
    }

    return this.initialized;
  }

  /**
   * Get RAG statistics
   * @returns {Promise<object>} - System statistics
   */
  async getStats() {
    try {
      const vectorStats = await this.vectordb.getStats();
      const isHealthy = await this.vectordb.healthCheck();

      return {
        initialized: this.initialized,
        healthy: isHealthy,
        ...vectorStats
      };
    } catch (error) {
      logger.error('Get RAG stats error:', error);
      return {
        initialized: this.initialized,
        healthy: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
let ragInstance = null;

/**
 * Get or create RAG system instance
 * @returns {RAGSystem}
 */
function getRAGSystem() {
  if (!ragInstance) {
    ragInstance = new RAGSystem();
  }
  return ragInstance;
}

module.exports = {
  RAGSystem,
  getRAGSystem,
  KnowledgeIndexer,
  KnowledgeRetriever,
  createEmbeddings,
  createVectorDB
};
