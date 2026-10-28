/**
 * 统一 LLM 客户端
 * 支持 OpenAI 和 Anthropic，自动路由到对应的 provider
 */

const { getConfig, getModelInfo, LLM_PROVIDERS } = require('./config');
const OpenAIProvider = require('./providers/openai');
const CostTracker = require('./costTracker');
const { llmCache, rateLimit } = require('../../cache');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// WebSocket handlers for streaming
let llmStream;
try {
  const websocket = require('../../websocket');
  llmStream = websocket.llmStream;
} catch (error) {
  // Fallback for when WebSocket is not available
  llmStream = {
    emitStart: () => {},
    emitToken: () => {},
    emitComplete: () => {},
    emitError: () => {},
    emitThinking: () => {}
  };
}

class LLMClient {
  constructor(options = {}) {
    this.config = getConfig();
    this.model = options.model || this.config.defaultModel;
    this.modelInfo = getModelInfo(this.model);
    this.costTracker = new CostTracker();

    if (!this.config.openai.apiKey) throw new Error('请在 backend/.env 配置 DeRouter 的 OPENAI_API_KEY');
    this.provider = new OpenAIProvider(this.config.openai);

    logger.info(`LLM client initialized: ${this.model} (${this.modelInfo.provider})`);
  }

  /**
   * 调用 LLM 生成文本
   */
  async chat(messages, options = {}) {
    const startTime = Date.now();
    options = {...options, cacheScope: options.userId || 'anonymous', endpoint: this.provider.client.baseURL};

    try {
      // 1. 检查速率限制
      const userId = options.userId || 'anonymous';
      const rateLimitKey = `llm:${userId}`;
      const rateCheck = await rateLimit.checkLimit(
        rateLimitKey,
        parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || '100', 10),
        3600 // 1 小时
      );

      if (!rateCheck.allowed) {
        throw new Error(
          `Rate limit exceeded. ${rateCheck.resetIn}s until reset.`
        );
      }

      // 2. 检查缓存（除非明确跳过）
      if (!options.skipCache) {
        const cached = await llmCache.get(messages, this.model, options);
        if (cached) {
          logger.info('LLM response from cache', {
            model: this.model,
            savedCost: cached.cost
          });

          return {
            ...cached.response,
            model: this.model, provider: this.modelInfo.provider, cost: 0, costKnown: true,
            fromCache: true,
            cached: true
          };
        }
      }

      // 3. 检查成本限制
      await this.costTracker.checkDailyLimit(this.config.maxDailyCost, userId);

      // 4. 调用对应的 provider
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

      // Record the actual provider usage once before publishing a reusable response.
      const duration = Date.now() - startTime;
      const usage = await this.trackUsage(response, duration, options);
      if (!options.skipCache) {
        await llmCache.set(messages, this.model, response, {
          ...options, ttl: options.cacheTTL || 86400, metadata: options.metadata
        });
      }

      return {
        ...response,
        model: this.model, provider: this.modelInfo.provider, cost: usage.cost, costKnown: usage.costKnown,
        fromCache: false,
        cached: false
      };
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
  async trackUsage(response, duration, options = {}) {
    const usage = {
      ownerId: options.userId,
      operationType: options.operationType || 'analysis',
      operationId: options.operationId || options.metadata?.analysisId || options.metadata?.suggestionId || 'legacy',
      model: this.model,
      provider: this.modelInfo.provider,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      cost: this.calculateCost(response.usage),
      costKnown: this.modelInfo.costPer1kInput > 0 && this.modelInfo.costPer1kOutput > 0,
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


    this.model = modelName;
    this.modelInfo = newModelInfo;
    logger.info(`Switched to model: ${this.model}`);
  }

  /**
   * Stream LLM response (like ChatGPT)
   * @param {Array} messages - Chat messages
   * @param {Object} options - Options
   * @param {string} options.streamId - Stream ID (auto-generated if not provided)
   * @param {string} options.userId - User ID for rate limiting
   * @param {boolean} options.skipCache - Skip cache check
   * @returns {Promise<{streamId: string, content: string, usage: Object}>}
   */
  async chatStream(messages, options = {}) {
    const streamId = options.streamId || uuidv4();
    const startTime = Date.now();

    try {
      // 1. Check rate limit
      const userId = options.userId || 'anonymous';
      const rateLimitKey = `llm:${userId}`;
      const rateCheck = await rateLimit.checkLimit(
        rateLimitKey,
        parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || '100', 10),
        3600
      );

      if (!rateCheck.allowed) {
        const error = new Error(`Rate limit exceeded. ${rateCheck.resetIn}s until reset.`);
        llmStream.emitError(streamId, error);
        throw error;
      }

      // 2. Check cache (streaming skips cache by default unless explicitly enabled)
      if (options.useCache) {
        const cached = await llmCache.get(messages, this.model, options);
        if (cached) {
          // Emit cached response as if it's streaming
          llmStream.emitStart(streamId, { model: this.model, fromCache: true });

          // Split content into chunks and emit slowly for effect
          const content = cached.response.content;
          const chunkSize = 10; // characters per chunk
          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            llmStream.emitToken(streamId, chunk);
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          llmStream.emitComplete(streamId, content, {
            usage: cached.response.usage,
            cost: cached.cost,
            fromCache: true
          });

          return {
            streamId,
            content,
            usage: cached.response.usage,
            fromCache: true
          };
        }
      }

      // 3. Check cost limit
      await this.costTracker.checkDailyLimit(this.config.maxDailyCost, userId);

      // 4. Emit stream start
      llmStream.emitStart(streamId, { model: this.model });
      llmStream.emitThinking(streamId, 'Processing your request...');

      // 5. Call provider with streaming
      const response = await this.provider.chat({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens,
        stream: true
      });

      let fullContent = '';
      let usage = null;

      // 6. Stream tokens to WebSocket
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          fullContent += delta.content;
          llmStream.emitToken(streamId, delta.content);
        }

        // Last chunk usually contains usage
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      // 7. Emit completion
      const cost = usage ? this.calculateCost(usage) : 0;
      llmStream.emitComplete(streamId, fullContent, { usage, cost });

      // 8. Cache the result
      if (!options.skipCache) {
        await llmCache.set(messages, this.model, {
          content: fullContent,
          usage
        }, {
          ttl: options.cacheTTL || 86400,
          metadata: options.metadata
        });
      }

      // 9. Track usage
      const duration = Date.now() - startTime;
      if (usage) {
        await this.trackUsage({ content: fullContent, usage }, duration, options);
      }

      return {
        streamId,
        content: fullContent,
        usage,
        fromCache: false
      };
    } catch (error) {
      logger.error('LLM stream error:', error);
      llmStream.emitError(streamId, error);
      throw error;
    }
  }
}

module.exports = LLMClient;
