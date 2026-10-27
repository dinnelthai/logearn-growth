/**
 * LLM 客户端测试脚本
 * 用于对比不同模型的效果和成本
 */

const { createClient, getAvailableModels } = require('./index');

async function testBasicChat(client, modelName) {
  console.log(`\n=== Testing ${modelName} ===`);

  const messages = [
    {
      role: 'system',
      content: 'You are a growth analytics expert. Provide concise insights.'
    },
    {
      role: 'user',
      content: `我们的活跃用户昨日下降了 15%。请分析可能的原因，给出 3 个最可能的假设。

要求：
1. 每个假设一句话
2. 按可能性排序
3. 用中文回答`
    }
  ];

  const startTime = Date.now();

  try {
    const response = await client.chat(messages);
    const duration = Date.now() - startTime;

    console.log('Response:', response.content);
    console.log('\nStats:');
    console.log('- Duration:', duration, 'ms');
    console.log('- Input tokens:', response.usage.inputTokens);
    console.log('- Output tokens:', response.usage.outputTokens);
    console.log('- Total tokens:', response.usage.totalTokens);

    const usage = await client.getTodayStats();
    console.log('\nToday stats:', usage);

    return response;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function testStructuredOutput(client, modelName) {
  console.log(`\n=== Testing Structured Output with ${modelName} ===`);

  const messages = [
    {
      role: 'user',
      content: `分析这个异常：活跃用户下降 15%。

请返回 JSON 格式：
{
  "metric": "指标名称",
  "change": -15,
  "hypotheses": [
    { "reason": "原因", "likelihood": "high/medium/low" }
  ],
  "suggestedActions": ["建议1", "建议2"]
}`
    }
  ];

  const schema = {
    name: 'anomaly_analysis',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        metric: { type: 'string' },
        change: { type: 'number' },
        hypotheses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              reason: { type: 'string' },
              likelihood: { type: 'string', enum: ['high', 'medium', 'low'] }
            },
            required: ['reason', 'likelihood'],
            additionalProperties: false
          }
        },
        suggestedActions: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['metric', 'change', 'hypotheses', 'suggestedActions'],
      additionalProperties: false
    }
  };

  try {
    const response = await client.generateStructured(messages, schema);
    console.log('Structured response:', JSON.parse(response.content));
    return response;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function compareModels(models) {
  console.log('\n=== Comparing Models ===\n');

  const results = [];

  for (const modelName of models) {
    console.log(`\nTesting ${modelName}...`);

    try {
      const client = createClient({ model: modelName });
      const response = await testBasicChat(client, modelName);

      results.push({
        model: modelName,
        success: true,
        duration: Date.now(),
        tokens: response.usage.totalTokens,
        cost: client.calculateCost(response.usage)
      });
    } catch (error) {
      results.push({
        model: modelName,
        success: false,
        error: error.message
      });
    }
  }

  console.log('\n=== Comparison Summary ===');
  console.table(results);

  return results;
}

async function main() {
  console.log('Available models:');
  const models = getAvailableModels();
  console.table(models);

  // 测试默认模型
  const defaultClient = createClient();
  await testBasicChat(defaultClient, 'default');

  // 如果需要，可以测试结构化输出
  // await testStructuredOutput(defaultClient, 'default');

  // 对比多个模型 (需要配置好对应的 API keys)
  // await compareModels(['gpt-4o-mini', 'claude-haiku-4']);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testBasicChat,
  testStructuredOutput,
  compareModels
};
