/**
 * 统一 LLM 客户端
 * 支持 OpenAI 和 Anthropic，自动路由到对应的 provider
 */

const { getConfig, getModelInfo, LLM_PROVIDERS } = require('./config');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const CostTracker = require('./costTracker');
const logger = require('../../utils/logger');

class LLMClient {
  constructor(options = {}) {
    this.config = getConfig();
    this.model = options.model || this.config.defaultModel;
    this.modelInfo = getModelInfo(this.model);
    this.costTracker = new CostTracker();

    // 初始化对应的 provider
    if (this.modelInfo.provider === LLM_PROVIDERS.OPENAI) {
      this.provider = new OpenAIProvider(this.config.openai);
    } else if (this.modelInfo.provider === LLM_PROVIDERS.ANTHROPIC) {
      this.provider = new AnthropicProvider(this.config.anthropic);
    } else {
      throw new Error(`Unsupported provider: ${this.modelInfo.provider}`);
    }

    logger.info(`LLM client initialized: ${this.model} (${this.modelInfo.provider})`);
  }

  /**
   * 调用 LLM 生成文本
   */
  async chat(messages, options = {}) {
    const startTime = Date.now();

    try {
      // 检查成本限制
      await this.costTracker.checkDailyLimit(this.config.maxDailyCost);

      // 调用对应的 provider
      const response = await this.provider.chat({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens,
        stream: options.stream ?? false,
        tools: options.tools,
        toolChoice: options.toolChoice,
        responseFormat: options.responseFormat
      });

      // 记录使用情况
      const duration = Date.now() - startTime;
      await this.trackUsage(response, duration);

      return response;
    } catch (error) {
      logger.error('LLM chat error:', error);
      throw error;
    }
  }

  /**
   * 生成结构化输出
   */
  async generateStructured(messages, schema, options = {}) {
    if (!this.modelInfo.supportsStructuredOutput) {
      throw new Error(`Model ${this.model} does not support structured output`);
    }

    return this.chat(messages, {
      ...options,
      responseFormat: {
        type: 'json_schema',
        json_schema: schema
      }
    });
  }

  /**
   * 使用工具调用
   */
  async chatWithTools(messages, tools, options = {}) {
    return this.chat(messages, {
      ...options,
      tools,
      toolChoice: options.toolChoice || 'auto'
    });
  }

  /**
   * 记录使用情况和成本
   */
  async trackUsage(response, duration) {
    const usage = {
      model: this.model,
      provider: this.modelInfo.provider,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      cost: this.calculateCost(response.usage),
      duration,
      timestamp: new Date()
    };

    await this.costTracker.track(usage);

    if (this.config.enableMetrics) {
      logger.info('LLM usage:', usage);
    }

    return usage;
  }

  /**
   * 计算成本
   */
  calculateCost(usage) {
    const inputCost = (usage.inputTokens / 1000) * this.modelInfo.costPer1kInput;
    const outputCost = (usage.outputTokens / 1000) * this.modelInfo.costPer1kOutput;
    return inputCost + outputCost;
  }

  /**
   * 获取今日使用统计
   */
  async getTodayStats() {
    return this.costTracker.getTodayStats();
  }

  /**
   * 切换模型
   */
  switchModel(modelName) {
    const newModelInfo = getModelInfo(modelName);

    // 如果 provider 变了，重新初始化
    if (newModelInfo.provider !== this.modelInfo.provider) {
      if (newModelInfo.provider === LLM_PROVIDERS.OPENAI) {
        this.provider = new OpenAIProvider(this.config.openai);
      } else if (newModelInfo.provider === LLM_PROVIDERS.ANTHROPIC) {
        this.provider = new AnthropicProvider(this.config.anthropic);
      }
    }

    this.model = modelName;
    this.modelInfo = newModelInfo;
    logger.info(`Switched to model: ${this.model}`);
  }
}

module.exports = LLMClient;
