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
      // A longer deadline is allowed for an explicitly-scoped weekly report
      // only. It is not a retry: transport timeouts leave billing unknown.
      const configured=Number(options.timeoutMs);
      const requestTimeout=Number.isSafeInteger(configured)&&configured>=30000&&configured<=540000
        ?configured:undefined;
      const response = await this.client.chat.completions.create(params,
        requestTimeout?{timeout:requestTimeout}:undefined);

      // Streaming responses are async iterables, not ChatCompletion objects.
      return options.stream ? response : this.normalizeResponse(response);
    } catch (error) {
      // SDK transport timeout does not prove the upstream model did no work.
      // Preserve a distinct code; the AI Worker marks the paid call as unknown.
      if(error?.name==='APIConnectionTimeoutError'||error?.code==='ETIMEDOUT'){
        logger.error('OpenAI API request timed out; billing outcome unknown:',error.message);
        throw Object.assign(new Error('模型请求超时，响应与费用尚未确认；禁止直接重试，需核对付费账本'),
          {code:'AI_UPSTREAM_TIMEOUT_UNKNOWN',cause:error});
      }
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
