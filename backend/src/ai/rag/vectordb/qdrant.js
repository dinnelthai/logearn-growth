const { QdrantClient } = require('@qdrant/js-client-rest');
const logger = require('../../../utils/logger');

/**
 * Qdrant Vector Database Client
 * Manages vector storage and similarity search
 */
class QdrantVectorDB {
  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY
    });
    this.collectionName = process.env.QDRANT_COLLECTION || 'logearn_knowledge';
    this.vectorSize = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);
  }

  /**
   * Initialize collection with indexes
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collectionName
      );

      if (!exists) {
        // Create collection with cosine distance
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine' // Cosine similarity
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });

        logger.info(`Created Qdrant collection: ${this.collectionName}`);
      }

      // Create payload indexes for fast filtering
      await this.createIndexes();

      logger.info('Qdrant initialized successfully');
    } catch (error) {
      logger.error('Qdrant initialization error:', error);
      throw error;
    }
  }

  /**
   * Create payload indexes for filtering
   * @private
   */
  async createIndexes() {
    const indexes = [
      { field_name: 'type', field_schema: 'keyword' },
      { field_name: 'date', field_schema: 'datetime' },
      { field_name: 'metric', field_schema: 'keyword' },
      { field_name: 'status', field_schema: 'keyword' }
    ];

    for (const index of indexes) {
      try {
        await this.client.createPayloadIndex(this.collectionName, index);
      } catch (error) {
        // Index might already exist, continue
        if (!error.message?.includes('already exists')) {
          logger.warn(`Index creation warning for ${index.field_name}:`, error.message);
        }
      }
    }
  }

  /**
   * Insert or update vectors
   * @param {Array} points - Array of {id, vector, payload}
   * @returns {Promise<void>}
   */
  async upsert(points) {
    try {
      if (!Array.isArray(points) || points.length === 0) {
        throw new Error('Points must be a non-empty array');
      }

      const formattedPoints = points.map((point, idx) => ({
        id: point.id || `${Date.now()}-${idx}`,
        vector: point.vector,
        payload: point.payload || {}
      }));

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: formattedPoints
      });

      logger.info(`Upserted ${points.length} points to Qdrant`);
    } catch (error) {
      logger.error('Qdrant upsert error:', error);
      throw error;
    }
  }

  /**
   * Vector similarity search
   * @param {number[]} queryVector - Query embedding
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Search results
   */
  async search(queryVector, options = {}) {
    try {
      const {
        limit = 5,
        filter = null,
        scoreThreshold = 0.7
      } = options;

      const searchParams = {
        vector: queryVector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
        with_vector: false
      };

      if (filter) {
        searchParams.filter = filter;
      }

      const results = await this.client.search(
        this.collectionName,
        searchParams
      );

      return results.map(result => ({
        id: result.id,
        score: result.score,
        payload: result.payload
      }));
    } catch (error) {
      logger.error('Qdrant search error:', error);
      throw error;
    }
  }

  /**
   * Hybrid search with filters
   * @param {number[]} queryVector - Query embedding
   * @param {object} filters - Filter conditions
   * @param {object} options - Search options
   * @returns {Promise<Array>} - Search results
   */
  async hybridSearch(queryVector, filters = {}, options = {}) {
    const qdrantFilter = this.buildFilter(filters);
    const limit = options.limit || 5;
    const scoreThreshold = options.scoreThreshold || 0.6;

    return await this.search(queryVector, {
      limit,
      filter: qdrantFilter,
      scoreThreshold
    });
  }

  /**
   * Build Qdrant filter from simple filters
   * @param {object} filters - Filter conditions
   * @returns {object|null} - Qdrant filter object
   * @private
   */
  buildFilter(filters) {
    const must = [];

    // Keyword filters
    ['type', 'metric', 'status'].forEach(field => {
      if (filters[field]) {
        must.push({
          key: field,
          match: { value: filters[field] }
        });
      }
    });

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      const range = {};
      if (filters.dateFrom) range.gte = filters.dateFrom;
      if (filters.dateTo) range.lte = filters.dateTo;

      must.push({
        key: 'date',
        range
      });
    }

    return must.length > 0 ? { must } : null;
  }

  /**
   * Delete points by filter
   * @param {object} filters - Filter conditions
   * @returns {Promise<void>}
   */
  async delete(filters) {
    try {
      const qdrantFilter = this.buildFilter(filters);

      if (!qdrantFilter) {
        throw new Error('Delete requires at least one filter');
      }

      await this.client.delete(this.collectionName, {
        wait: true,
        filter: qdrantFilter
      });

      logger.info('Deleted points from Qdrant');
    } catch (error) {
      logger.error('Qdrant delete error:', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   * @returns {Promise<object>} - Collection stats
   */
  async getStats() {
    try {
      const info = await this.client.getCollection(this.collectionName);

      return {
        pointsCount: info.points_count,
        vectorsCount: info.vectors_count,
        indexedVectorsCount: info.indexed_vectors_count,
        status: info.status,
        optimizerStatus: info.optimizer_status
      };
    } catch (error) {
      logger.error('Qdrant stats error:', error);
      return null;
    }
  }

  /**
   * Check if Qdrant is healthy
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const collections = await this.client.getCollections();
      return collections && collections.collections !== undefined;
    } catch (error) {
      logger.error('Qdrant health check failed:', error);
      return false;
    }
  }
}

module.exports = QdrantVectorDB;
