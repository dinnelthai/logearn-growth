const { createEmbeddings } = require('../embeddings');
const { createVectorDB } = require('../vectordb');
const pool = require('../../../db/pool');
const logger = require('../../../utils/logger');

/**
 * Knowledge Indexer
 * Builds and maintains the vector index from various knowledge sources
 */
class KnowledgeIndexer {
  constructor() {
    this.embeddings = createEmbeddings('openai');
    this.vectordb = createVectorDB('qdrant');
  }

  /**
   * Index historical AI findings
   * @param {number} limit - Maximum number of findings to index
   * @returns {Promise<number>} - Number of indexed findings
   */
  async indexFindings(limit = 1000) {
    try {
      logger.info(`Indexing findings (limit: ${limit})...`);

      // Fetch historical findings from database
      const result = await pool.query(
        `SELECT
          id, date, metric, change_percent,
          current_value, previous_value, evidence, status,
          created_at
        FROM ai_findings
        WHERE status IN ('resolved', 'confirmed')
          AND evidence IS NOT NULL
        ORDER BY date DESC
        LIMIT $1`,
        [limit]
      );

      const findings = result.rows;

      if (findings.length === 0) {
        logger.info('No findings to index');
        return 0;
      }

      // Build text representations
      const texts = findings.map(f => this.buildFindingText(f));

      // Generate embeddings in batch
      logger.info('Generating embeddings...');
      const embeddings = await this.embeddings.embedBatch(texts);

      // Prepare points for vector database
      const points = findings.map((finding, idx) => ({
        id: `finding-${finding.id}`,
        vector: embeddings[idx],
        payload: {
          type: 'finding',
          findingId: finding.id,
          date: finding.date,
          metric: finding.metric,
          changePercent: finding.change_percent,
          currentValue: finding.current_value,
          previousValue: finding.previous_value,
          status: finding.status,
          text: texts[idx],
          evidence: finding.evidence,
          createdAt: finding.created_at
        }
      }));

      // Insert into vector database
      logger.info('Upserting to vector database...');
      await this.vectordb.upsert(points);

      logger.info(`Successfully indexed ${points.length} findings`);
      return points.length;
    } catch (error) {
      logger.error('Index findings error:', error);
      throw error;
    }
  }

  /**
   * Build searchable text from finding
   * @param {object} finding - Finding object
   * @returns {string} - Text representation
   * @private
   */
  buildFindingText(finding) {
    const { metric, date, change_percent, evidence } = finding;

    const parts = [
      `日期: ${date}`,
      `指标: ${metric}`,
      `变化: ${change_percent}%`
    ];

    if (evidence) {
      if (evidence.description) {
        parts.push(`描述: ${evidence.description}`);
      }
      if (evidence.conclusion) {
        parts.push(`结论: ${evidence.conclusion}`);
      }
      if (evidence.recommendation) {
        parts.push(`建议: ${evidence.recommendation}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Index human annotations
   * @param {number} limit - Maximum number of annotations to index
   * @returns {Promise<number>} - Number of indexed annotations
   */
  async indexAnnotations(limit = 500) {
    try {
      logger.info(`Indexing annotations (limit: ${limit})...`);

      const result = await pool.query(
        `SELECT
          a.id, a.finding_id, a.annotation, a.correctness,
          a.created_at, f.metric, f.date, f.evidence
        FROM human_annotations a
        JOIN ai_findings f ON a.finding_id = f.id
        ORDER BY a.created_at DESC
        LIMIT $1`,
        [limit]
      );

      const annotations = result.rows;

      if (annotations.length === 0) {
        logger.info('No annotations to index');
        return 0;
      }

      const texts = annotations.map(a => this.buildAnnotationText(a));
      const embeddings = await this.embeddings.embedBatch(texts);

      const points = annotations.map((annotation, idx) => ({
        id: `annotation-${annotation.id}`,
        vector: embeddings[idx],
        payload: {
          type: 'annotation',
          annotationId: annotation.id,
          findingId: annotation.finding_id,
          metric: annotation.metric,
          date: annotation.date,
          annotation: annotation.annotation,
          correctness: annotation.correctness,
          text: texts[idx],
          createdAt: annotation.created_at
        }
      }));

      await this.vectordb.upsert(points);

      logger.info(`Successfully indexed ${points.length} annotations`);
      return points.length;
    } catch (error) {
      logger.error('Index annotations error:', error);
      throw error;
    }
  }

  /**
   * Build searchable text from annotation
   * @param {object} annotation - Annotation object
   * @returns {string} - Text representation
   * @private
   */
  buildAnnotationText(annotation) {
    const parts = [
      `指标: ${annotation.metric}`,
      `日期: ${annotation.date}`,
      `人工标注: ${annotation.annotation}`,
      `正确性: ${annotation.correctness}`
    ];

    if (annotation.evidence?.description) {
      parts.push(`原分析: ${annotation.evidence.description}`);
    }

    return parts.join('\n');
  }

  /**
   * Index custom documents or notes
   * @param {Array} documents - Array of {title, content, metadata}
   * @returns {Promise<number>} - Number of indexed documents
   */
  async indexDocuments(documents) {
    try {
      if (!Array.isArray(documents) || documents.length === 0) {
        return 0;
      }

      logger.info(`Indexing ${documents.length} documents...`);

      const texts = documents.map(doc => this.buildDocumentText(doc));
      const embeddings = await this.embeddings.embedBatch(texts);

      const points = documents.map((doc, idx) => ({
        id: doc.id || `doc-${Date.now()}-${idx}`,
        vector: embeddings[idx],
        payload: {
          type: 'document',
          title: doc.title,
          text: texts[idx],
          metadata: doc.metadata || {},
          createdAt: doc.createdAt || new Date().toISOString()
        }
      }));

      await this.vectordb.upsert(points);

      logger.info(`Successfully indexed ${points.length} documents`);
      return points.length;
    } catch (error) {
      logger.error('Index documents error:', error);
      throw error;
    }
  }

  /**
   * Build searchable text from document
   * @param {object} document - Document object
   * @returns {string} - Text representation
   * @private
   */
  buildDocumentText(document) {
    const parts = [`标题: ${document.title}`];

    if (document.content) {
      parts.push(`内容: ${document.content}`);
    }

    if (document.metadata) {
      Object.entries(document.metadata).forEach(([key, value]) => {
        parts.push(`${key}: ${value}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Re-index everything
   * @returns {Promise<object>} - Index statistics
   */
  async reindexAll() {
    try {
      logger.info('Starting full re-index...');

      const stats = {
        findings: 0,
        annotations: 0
      };

      stats.findings = await this.indexFindings(1000);
      stats.annotations = await this.indexAnnotations(500);

      logger.info('Full re-index complete:', stats);
      return stats;
    } catch (error) {
      logger.error('Re-index error:', error);
      throw error;
    }
  }
}

module.exports = KnowledgeIndexer;
