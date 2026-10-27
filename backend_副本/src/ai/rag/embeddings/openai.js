const OpenAI = require('openai');
const logger = require('../../../utils/logger');

/**
 * OpenAI Embeddings Service
 * Generates vector embeddings for text using OpenAI's embedding models
 */
class OpenAIEmbeddings {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector
   */
  async embed(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }

      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.trim(),
        encoding_format: 'float',
        dimensions: this.dimensions
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Embedding generation error:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Array of embedding vectors
   */
  async embedBatch(texts) {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      // OpenAI API supports up to 2048 inputs per request
      const BATCH_SIZE = 2048;
      const results = [];

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.trim());

        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float',
          dimensions: this.dimensions
        });

        results.push(...response.data.map(item => item.embedding));
      }

      return results;
    } catch (error) {
      logger.error('Batch embedding error:', error);
      throw error;
    }
  }

  /**
   * Calculate cost for embedding generation
   * @param {number} tokenCount - Number of tokens
   * @returns {number} - Cost in USD
   */
  calculateCost(tokenCount) {
    const costs = {
      'text-embedding-3-small': 0.02,  // $0.02 / 1M tokens
      'text-embedding-3-large': 0.13,  // $0.13 / 1M tokens
      'text-embedding-ada-002': 0.10   // $0.10 / 1M tokens
    };

    const costPer1M = costs[this.model] || 0.02;
    return (tokenCount / 1000000) * costPer1M;
  }

  /**
   * Estimate token count for text
   * @param {string} text - Input text
   * @returns {number} - Estimated token count
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

module.exports = OpenAIEmbeddings;
