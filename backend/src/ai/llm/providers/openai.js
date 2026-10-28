/**
 * OpenAI Provider (ChatGPT)
 */

const OpenAI = require('openai');
const logger = require('../../../utils/logger');
const {normalizeUsage}=require('../usage');

class OpenAIProvider {
  constructor(config) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
      timeout: Number(process.env.AI_TIMEOUT || 120000),
      maxRetries: 0
    });
  }

  /**
   * 调用 OpenAI Chat Completion API
   */
  async chat(options) {
    const params = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: options.stream
    };

    if(options.stream) params.stream_options={include_usage:true};
    if (options.maxTokens) {
      params.max_tokens = options.maxTokens;
    }

    // 工具调用
    if (options.tools) {
      params.tools = options.tools;
      if (options.toolChoice) {
        params.tool_choice = options.toolChoice;
      }
    }

    // 结构化输出
    if (options.responseFormat) {
      params.response_format = options.responseFormat;
    }

    try {
      const response = await this.client.chat.completions.create(params);

      // Streaming responses are async iterables, not ChatCompletion objects.
      return options.stream ? response : this.normalizeResponse(response);
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`OpenAI error: ${error.message}`);
    }
  }

  /**
   * 标准化响应格式
   */
  normalizeResponse(response) {
    const choice = response.choices[0];

    return {
      content: choice.message.content,
      role: choice.message.role,
      toolCalls: choice.message.tool_calls,
      finishReason: choice.finish_reason,
      usage: normalizeUsage(response.usage),
      raw: response
    };
  }
}

module.exports = OpenAIProvider;
