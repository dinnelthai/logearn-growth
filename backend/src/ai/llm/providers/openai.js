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
    // A weekly report can collect a streamed response internally, while the
    // paid-call journal still receives ONE complete JSON completion. Receiving
    // SSE chunks can avoid a proxy's idle-response timeout; it does not prove
    // success if the proxy fails before the first chunk.
    const wireStream=options.stream===true||options.collectStream===true;
    const params = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: wireStream
    };

    if(wireStream) params.stream_options={include_usage:true};
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

      if(options.collectStream===true){
        let content='',usage=null,finishReason=null,finished=false;
        for await (const chunk of response){
          if(chunk?.usage)usage=chunk.usage;
          const choice=chunk?.choices?.[0];
          if(typeof choice?.delta?.content==='string')content+=choice.delta.content;
          if(choice?.finish_reason!=null){
            finished=true;
            finishReason=choice.finish_reason;
          }
        }
        // A broken SSE connection can carry partial JSON. Never publish or
        // cache it as success and never silently reissue the paid request.
        if(!finished||!content.trim()){
          throw Object.assign(new Error('流式响应未完整结束；模型执行和费用状态未知，禁止自动重试'),
            {code:'AI_STREAM_INCOMPLETE_UNKNOWN'});
        }
        return {content,role:'assistant',finishReason,
          usage:normalizeUsage(usage),streamCollected:true};
      }
      // Existing WebSocket streaming and non-streaming consumers unchanged.
      return options.stream ? response : this.normalizeResponse(response);
    } catch (error) {
      // SDK transport timeout does not prove the upstream model did no work.
      // Preserve a distinct code; the AI Worker marks the paid call as unknown.
      if(error?.name==='APIConnectionTimeoutError'||error?.code==='ETIMEDOUT'){
        logger.error('OpenAI API request timed out; billing outcome unknown:',error.message);
        throw Object.assign(new Error('模型请求超时，响应与费用尚未确认；禁止直接重试，需核对付费账本'),
          {code:'AI_UPSTREAM_TIMEOUT_UNKNOWN',cause:error});
      }
      if(error?.status===524){
        logger.error('LLM relay returned HTTP 524 (Cloudflare upstream timeout); billing unknown');
        throw Object.assign(new Error(
          '模型中转站 HTTP 524：上游响应超时，模型是否已执行及费用均未确认；请先核对中转站账单，不要直接重复付费请求'),
          {code:'AI_UPSTREAM_524_UNKNOWN',status:524,cause:error});
      }
      if(error?.code==='AI_STREAM_INCOMPLETE_UNKNOWN')throw error;
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
