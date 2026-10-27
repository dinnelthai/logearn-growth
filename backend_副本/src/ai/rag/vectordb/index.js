const QdrantVectorDB = require('./qdrant');

/**
 * Factory function to create vector database instance
 * @param {string} provider - Provider name (qdrant, etc.)
 * @returns {QdrantVectorDB} - Vector database instance
 */
function createVectorDB(provider = 'qdrant') {
  switch (provider.toLowerCase()) {
    case 'qdrant':
      return new QdrantVectorDB();
    default:
      throw new Error(`Unsupported vector database provider: ${provider}`);
  }
}

module.exports = {
  QdrantVectorDB,
  createVectorDB
};
