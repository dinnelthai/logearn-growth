/**
 * LLM 配置
 * 支持 OpenAI (ChatGPT) 和 Anthropic (Claude)
 */

const LLM_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic'
};

const LLM_MODELS = {
  // OpenAI models
  'gpt-4o': {
    provider: LLM_PROVIDERS.OPENAI,
    maxTokens: 128000,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    supportsStructuredOutput: true
  },
  'gpt-4o-mini': {
    provider: LLM_PROVIDERS.OPENAI,
    maxTokens: 128000,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    supportsStructuredOutput: true
  },
  'gpt-4-turbo': {
    provider: LLM_PROVIDERS.OPENAI,
    maxTokens: 128000,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    supportsStructuredOutput: true
  },

  // Anthropic models
  'claude-opus-4': {
    provider: LLM_PROVIDERS.ANTHROPIC,
    maxTokens: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    supportsStructuredOutput: true
  },
  'claude-sonnet-4': {
    provider: LLM_PROVIDERS.ANTHROPIC,
    maxTokens: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsStructuredOutput: true
  },
  'claude-haiku-4': {
    provider: LLM_PROVIDERS.ANTHROPIC,
    maxTokens: 200000,
    costPer1kInput: 0.0003,
    costPer1kOutput: 0.0015,
    supportsStructuredOutput: true
  }
};

/**
 * 从环境变量获取配置
 */
function getConfig() {
  return {
    // 默认使用的模型
    defaultModel: process.env.AI_DEFAULT_MODEL || 'gpt-4o-mini',

    // OpenAI 配置
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      organization: process.env.OPENAI_ORGANIZATION
    },

    // Anthropic 配置
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    },

    // 通用配置
    timeout: parseInt(process.env.AI_TIMEOUT || '60000', 10), // 60s
    retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.AI_RETRY_DELAY || '1000', 10), // 1s

    // 成本控制
    maxDailyCost: parseFloat(process.env.AI_MAX_DAILY_COST || '5.0'), // $5/day
    alertThreshold: parseFloat(process.env.AI_COST_ALERT_THRESHOLD || '3.0'), // $3/day

    // 日志
    logLevel: process.env.AI_LOG_LEVEL || 'info',
    enableMetrics: process.env.AI_ENABLE_METRICS !== 'false'
  };
}

/**
 * 获取模型信息
 */
function getModelInfo(modelName) {
  const model = LLM_MODELS[modelName];
  if (!model) {
    throw new Error(`Unknown model: ${modelName}`);
  }
  return model;
}

/**
 * 验证配置
 */
function validateConfig() {
  const config = getConfig();
  const model = getModelInfo(config.defaultModel);

  if (model.provider === LLM_PROVIDERS.OPENAI && !config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI models');
  }

  if (model.provider === LLM_PROVIDERS.ANTHROPIC && !config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for Anthropic models');
  }

  return true;
}

module.exports = {
  LLM_PROVIDERS,
  LLM_MODELS,
  getConfig,
  getModelInfo,
  validateConfig
};
