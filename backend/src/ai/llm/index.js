/**
 * LLM 模块入口
 */

const LLMClient = require('./client');
const { getConfig, getModelInfo, LLM_MODELS } = require('./config');
const CostTracker = require('./costTracker');

/**
 * 创建 LLM 客户端实例
 */
function createClient(options) {
  return new LLMClient(options);
}

/**
 * 获取可用的模型列表
 */
function getAvailableModels() {
  return Object.keys(LLM_MODELS).map(name => ({
    name,
    ...LLM_MODELS[name]
  }));
}

module.exports = {
  createClient,
  getConfig,
  getModelInfo,
  getAvailableModels,
  CostTracker,
  LLMClient
};
