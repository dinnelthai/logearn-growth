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
const {normalizeUsage}=require('./usage');

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
        3600, // 1 小时
        {failClosed:true}
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

      // Unknown tariff is not free. Block BEFORE the first paid request.
      if(!this.modelInfo.pricingKnown)
        throw Error('模型中转站单价未配置，禁止付费调用：请设置 AI_RELAY_COST_PER_1K_INPUT / OUTPUT');
      await this.costTracker.checkDailyLimit(this.config.maxDailyCost, userId, this.config.maxDailyTokens);

      // 4. 调用对应的 provider
      const response = await this.provider.chat({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens,
        stream: options.stream ?? false,
        // Internal SSE collection is one regular paid completion, not a
        // client-visible stream. The default chat path is unchanged.
        collectStream: options.collectStream===true,
        tools: options.tools,
        toolChoice: options.toolChoice,
        responseFormat: options.responseFormat,
        timeoutMs: options.timeoutMs
      });

      // Record the actual provider usage once before publishing a reusable response.
      const duration = Date.now() - startTime;
      const usage = await this.trackUsage(response, duration, options);
      if (!options.skipCache && usage.usage.known) {
        await llmCache.set(messages, this.model, response, {
          ...options, ttl: options.cacheTTL || 86400, metadata: options.metadata
        });
      }

      return {
        ...response, usage:usage.usage,
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
    const tokens=normalizeUsage(response.usage);
    const usage = {
      ownerId: options.userId,
      operationType: options.operationType || 'analysis',
      operationId: options.operationId || options.metadata?.analysisId || options.metadata?.suggestionId || 'legacy',
      traceId: options.traceId || null,
      round: Number.isSafeInteger(options.round) ? options.round : null,
      model: this.model,
      provider: this.modelInfo.provider,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.totalTokens,
      cost: tokens.known?this.calculateCost(tokens):0,
      costKnown: tokens.known && this.modelInfo.pricingKnown,
      duration,
      timestamp: new Date()
    };

    await this.costTracker.track(usage);
    usage.usage=tokens;

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
    options={...options,cacheScope:options.userId||'anonymous',endpoint:this.provider.client.baseURL};
    const startTime = Date.now();

    try {
      // 1. Check rate limit
      const userId = options.userId || 'anonymous';
      const rateLimitKey = `llm:${userId}`;
      const rateCheck = await rateLimit.checkLimit(
        rateLimitKey,
        parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || '100', 10),
        3600,
        {failClosed:true}
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
      if(!this.modelInfo.pricingKnown)
        throw Error('模型中转站单价未配置，禁止付费流式调用');
      await this.costTracker.checkDailyLimit(this.config.maxDailyCost, userId, this.config.maxDailyTokens);

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

      // Normalize the relay's snake_case usage before charging or caching.
      const normalized=normalizeUsage(usage);
      const cost=normalized.known?this.calculateCost(normalized):0;
      const duration=Date.now()-startTime;
      const tracked=await this.trackUsage({content:fullContent,usage:normalized},duration,options);
      llmStream.emitComplete(streamId,fullContent,{usage:normalized,cost,costKnown:tracked.costKnown});

      // 8. Cache the result
      if (!options.skipCache && normalized.known) {
        await llmCache.set(messages,this.model,{content:fullContent,usage:normalized},
         {...options,ttl:options.cacheTTL||86400,metadata:options.metadata});
      }
      return {streamId,content:fullContent,usage:normalized,
       cost:tracked.cost,costKnown:tracked.costKnown,fromCache:false};
    } catch (error) {
      logger.error('LLM stream error:', error);
      llmStream.emitError(streamId, error);
      throw error;
    }
  }
}

module.exports = LLMClient;
