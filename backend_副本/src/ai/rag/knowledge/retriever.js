const { createEmbeddings } = require('../embeddings');
const { createVectorDB } = require('../vectordb');
const logger = require('../../../utils/logger');

/**
 * Knowledge Retriever
 * Retrieves relevant knowledge from vector database
 */
class KnowledgeRetriever {
  constructor() {
    this.embeddings = createEmbeddings('openai');
    this.vectordb = createVectorDB('qdrant');
  }

  /**
   * Retrieve similar findings
   * @param {string} query - Query text
   * @param {object} options - Retrieval options
   * @returns {Promise<Array>} - Similar findings
   */
  async retrieveSimilarFindings(query, options = {}) {
    try {
      const {
        limit = 5,
        metric = null,
        dateFrom = null,
        dateTo = null,
        scoreThreshold = 0.7
      } = options;

      // Generate query embedding
      const queryVector = await this.embeddings.embed(query);

      // Build filters
      const filters = { type: 'finding' };
      if (metric) filters.metric = metric;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      // Search vector database
      const results = await this.vectordb.hybridSearch(
        queryVector,
        filters,
        { limit, scoreThreshold }
      );

      // Format results
      return results.map(r => ({
        id: r.payload.findingId,
        score: r.score,
        date: r.payload.date,
        metric: r.payload.metric,
        changePercent: r.payload.changePercent,
        text: r.payload.text,
        evidence: r.payload.evidence,
        status: r.payload.status
      }));
    } catch (error) {
      logger.error('Retrieve similar findings error:', error);
      throw error;
    }
  }

  /**
   * Retrieve similar annotations
   * @param {string} query - Query text
   * @param {object} options - Retrieval options
   * @returns {Promise<Array>} - Similar annotations
   */
  async retrieveSimilarAnnotations(query, options = {}) {
    try {
      const {
        limit = 3,
        scoreThreshold = 0.7
      } = options;

      const queryVector = await this.embeddings.embed(query);

      const results = await this.vectordb.hybridSearch(
        queryVector,
        { type: 'annotation' },
        { limit, scoreThreshold }
      );

      return results.map(r => ({
        id: r.payload.annotationId,
        findingId: r.payload.findingId,
        score: r.score,
        annotation: r.payload.annotation,
        correctness: r.payload.correctness,
        text: r.payload.text,
        metric: r.payload.metric,
        date: r.payload.date
      }));
    } catch (error) {
      logger.error('Retrieve similar annotations error:', error);
      throw error;
    }
  }

  /**
   * Retrieve documents by query
   * @param {string} query - Query text
   * @param {object} options - Retrieval options
   * @returns {Promise<Array>} - Similar documents
   */
  async retrieveDocuments(query, options = {}) {
    try {
      const {
        limit = 5,
        scoreThreshold = 0.6
      } = options;

      const queryVector = await this.embeddings.embed(query);

      const results = await this.vectordb.hybridSearch(
        queryVector,
        { type: 'document' },
        { limit, scoreThreshold }
      );

      return results.map(r => ({
        id: r.id,
        score: r.score,
        title: r.payload.title,
        text: r.payload.text,
        metadata: r.payload.metadata
      }));
    } catch (error) {
      logger.error('Retrieve documents error:', error);
      throw error;
    }
  }

  /**
   * Retrieve all relevant context for a query
   * @param {string} query - Query text
   * @param {object} options - Retrieval options
   * @returns {Promise<object>} - Consolidated context
   */
  async retrieveContext(query, options = {}) {
    try {
      const {
        maxFindings = 3,
        maxAnnotations = 2,
        maxDocuments = 2
      } = options;

      logger.info('Retrieving context for query:', query);

      // Retrieve from all sources in parallel
      const [findings, annotations, documents] = await Promise.all([
        this.retrieveSimilarFindings(query, { limit: maxFindings }),
        this.retrieveSimilarAnnotations(query, { limit: maxAnnotations }),
        this.retrieveDocuments(query, { limit: maxDocuments })
      ]);

      return {
        findings,
        annotations,
        documents,
        totalResults: findings.length + annotations.length + documents.length
      };
    } catch (error) {
      logger.error('Retrieve context error:', error);
      throw error;
    }
  }

  /**
   * Build prompt context from retrieved results
   * @param {object} context - Retrieved context
   * @returns {string} - Formatted context for prompt
   */
  buildPromptContext(context) {
    const parts = [];

    if (context.findings && context.findings.length > 0) {
      parts.push('## 相关历史分析\n');
      context.findings.forEach((finding, idx) => {
        parts.push(`${idx + 1}. [${finding.date}] ${finding.metric}`);
        parts.push(`   变化: ${finding.changePercent}%`);
        parts.push(`   结论: ${finding.evidence?.conclusion || '无'}`);
        parts.push(`   相似度: ${(finding.score * 100).toFixed(1)}%\n`);
      });
    }

    if (context.annotations && context.annotations.length > 0) {
      parts.push('## 人工标注意见\n');
      context.annotations.forEach((ann, idx) => {
        parts.push(`${idx + 1}. ${ann.annotation}`);
        parts.push(`   正确性: ${ann.correctness}`);
        parts.push(`   相似度: ${(ann.score * 100).toFixed(1)}%\n`);
      });
    }

    if (context.documents && context.documents.length > 0) {
      parts.push('## 相关文档\n');
      context.documents.forEach((doc, idx) => {
        parts.push(`${idx + 1}. ${doc.title}`);
        parts.push(`   ${doc.text.substring(0, 200)}...`);
        parts.push(`   相似度: ${(doc.score * 100).toFixed(1)}%\n`);
      });
    }

    return parts.join('\n');
  }
}

module.exports = KnowledgeRetriever;
