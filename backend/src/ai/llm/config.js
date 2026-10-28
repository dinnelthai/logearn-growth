/**
 * LLM 配置
 * 支持 OpenAI (ChatGPT) 和 Anthropic (Claude)
 */

const LLM_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  DOMESTIC: 'domestic'
};

const LLM_MODELS = {
  'claude-sonnet-4-6': {
    provider: LLM_PROVIDERS.OPENAI,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    supportsStructuredOutput: false
  }
};

/**
 * 从环境变量获取配置
 */
function getConfig() {
  return {
    // 默认使用的模型
    defaultModel: process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-6',

    // OpenAI 配置
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.derouter.network/openai/v1',
      organization: process.env.OPENAI_ORGANIZATION
    },

    // 通用配置
    timeout: parseInt(process.env.AI_TIMEOUT || '60000', 10), // 60s
    retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.AI_RETRY_DELAY || '1000', 10), // 1s

    // 成本控制
    maxDailyCost: parseFloat(process.env.AI_MAX_DAILY_COST || '5.0'), // $5/day
    maxDailyTokens: Number(process.env.AI_MAX_DAILY_TOKENS || 100000), // conservative per-owner guard
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
  const configuredModel = getConfig().defaultModel;
  if (modelName !== configuredModel) throw new Error(`Unknown model: ${modelName}`);
  const input = Number(process.env.AI_RELAY_COST_PER_1K_INPUT || 0);
  const output = Number(process.env.AI_RELAY_COST_PER_1K_OUTPUT || 0);
  if (![input, output].every(n => Number.isFinite(n) && n >= 0)) {
    throw new Error('模型价格必须为非负数');
  }
  // Missing relay prices must not silently mean that paid inference is free.
  // An explicitly configured pair of zero prices is a confirmed free tier.
  // Example env files used to contain 0/0 placeholders. Do not mistake those
  // for a verified free model. Paid rates require two positive prices.
  const pricingKnown=(input>0&&output>0)||
    (input===0&&output===0&&process.env.AI_RELAY_FREE_TIER_VERIFIED==='1');
  const model = {
    ...LLM_MODELS['claude-sonnet-4-6'],
    costPer1kInput: input,
    costPer1kOutput: output,
    pricingKnown
  };
  return model;
}

/**
 * 验证配置
 */
function validateConfig() {
  const config = getConfig();
  const model = getModelInfo(config.defaultModel);
  if(!Number.isSafeInteger(config.maxDailyTokens)||config.maxDailyTokens<1)
    throw Error('AI_MAX_DAILY_TOKENS 必须是正整数');

  if (model.provider === LLM_PROVIDERS.OPENAI && !config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI models');
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
