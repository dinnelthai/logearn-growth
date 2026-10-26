const OpenAIEmbeddings = require('./openai');

/**
 * Factory function to create embeddings service
 * @param {string} provider - Provider name (openai, etc.)
 * @returns {OpenAIEmbeddings} - Embeddings service instance
 */
function createEmbeddings(provider = 'openai') {
  switch (provider.toLowerCase()) {
    case 'openai':
      return new OpenAIEmbeddings();
    default:
      throw new Error(`Unsupported embeddings provider: ${provider}`);
  }
}

module.exports = {
  OpenAIEmbeddings,
  createEmbeddings
};
