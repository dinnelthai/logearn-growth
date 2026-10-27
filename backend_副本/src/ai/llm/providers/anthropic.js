/**
 * Anthropic Provider (Claude)
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../../../utils/logger');

class AnthropicProvider {
  constructor(config) {
    this.client = new Anthropic({
      apiKey: config.authToken ? null : config.apiKey,
      authToken: config.authToken || null,
      baseURL: config.baseURL,
      timeout: Number(process.env.AI_TIMEOUT || 120000),
      maxRetries: 0
    });
  }

  /**
   * 调用 Anthropic Messages API
   */
  async chat(options) {
    const params = {
      model: options.model,
      messages: this.convertMessages(options.messages.filter(m => m.role !== 'system')),
      system: options.messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
      temperature: options.temperature,
      max_tokens: options.maxTokens || 4096,
      stream: options.stream
    };

    // 工具调用
    if (options.tools) {
      params.tools = this.convertTools(options.tools);
      if (options.toolChoice && options.toolChoice !== 'auto') {
        params.tool_choice = { type: options.toolChoice };
      }
    }

    try {
      const response = await this.client.messages.create(params);

      return this.normalizeResponse(response);
    } catch (error) {
      logger.error('Anthropic API error:', error);
      throw new Error(`Anthropic error: ${error.message}`);
    }
  }

  /**
   * 转换消息格式 (OpenAI -> Anthropic)
   */
  convertMessages(messages) {
    return messages.map(msg => {
      if (msg.role === 'system') {
        // Anthropic 不支持 system role，需要转换为 user 消息
        return {
          role: 'user',
          content: `<system>${msg.content}</system>`
        };
      }
      return {
        role: msg.role,
        content: msg.content
      };
    });
  }

  /**
   * 转换工具格式 (OpenAI -> Anthropic)
   */
  convertTools(tools) {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }

  /**
   * 标准化响应格式
   */
  normalizeResponse(response) {
    const content = response.content.find(c => c.type === 'text') || response.content[0];

    let textContent = '';
    let toolCalls = null;

    if (content.type === 'text') {
      textContent = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    } else if (content.type === 'tool_use') {
      toolCalls = [{
        id: content.id,
        type: 'function',
        function: {
          name: content.name,
          arguments: JSON.stringify(content.input)
        }
      }];
    }

    return {
      content: textContent,
      role: response.role,
      toolCalls,
      finishReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      raw: response
    };
  }
}

module.exports = AnthropicProvider;
