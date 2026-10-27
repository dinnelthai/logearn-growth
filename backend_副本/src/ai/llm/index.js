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
  return [getConfig().defaultModel].map(name => ({
    name,
    ...getModelInfo(name)
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
