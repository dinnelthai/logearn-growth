# AI Growth Agent - LLM 集成

## 概述

支持多 LLM 提供商的统一访问层，可以方便地切换和对比 OpenAI (ChatGPT) 和 Anthropic (Claude) 的效果和成本。

## 架构

```
backend/src/ai/
├── llm/
│   ├── config.js           # 配置管理
│   ├── client.js           # 统一客户端
│   ├── costTracker.js      # 成本追踪
│   ├── providers/
│   │   ├── openai.js       # OpenAI provider
│   │   └── anthropic.js    # Anthropic provider
│   ├── test.js             # 测试脚本
│   └── index.js            # 导出入口
```

## 配置

### 1. 环境变量

复制 `.env.example` 到 `.env` 并填写：

```bash
# 默认使用的模型
AI_DEFAULT_MODEL=gpt-4o-mini

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com

# 成本控制
AI_MAX_DAILY_COST=5.0
AI_COST_ALERT_THRESHOLD=3.0
```

### 2. 数据库迁移

运行迁移创建 AI 相关表：

```bash
npm run migrate
```

这会创建：
- `ai_usage_logs` - 记录每次 LLM 调用
- `ai_findings` - 异常检测结果
- `ai_investigations` - 维度拆解记录
- `ai_suggestions` - 增长建议
- `ai_tracking` - 效果追踪

### 3. 安装依赖

```bash
cd backend
npm install
```

## 使用

### 基础用法

```javascript
const { createClient } = require('./ai/llm');

// 使用默认模型
const client = createClient();

// 或指定模型
const client = createClient({ model: 'claude-sonnet-4' });

// 发送消息
const response = await client.chat([
  { role: 'system', content: 'You are a growth analyst.' },
  { role: 'user', content: '分析活跃用户下降 15% 的原因' }
]);

console.log(response.content);
console.log('Cost:', client.calculateCost(response.usage));
```

### 结构化输出

```javascript
const schema = {
  name: 'anomaly_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      metric: { type: 'string' },
      hypotheses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            likelihood: { type: 'string', enum: ['high', 'medium', 'low'] }
          },
          required: ['reason', 'likelihood']
        }
      }
    },
    required: ['metric', 'hypotheses']
  }
};

const response = await client.generateStructured(messages, schema);
const result = JSON.parse(response.content);
```

### 工具调用 (Function Calling)

```javascript
const tools = [
  {
    type: 'function',
    function: {
      name: 'query_by_channel',
      description: '按渠道查询指标',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          date: { type: 'string' }
        },
        required: ['metric', 'date']
      }
    }
  }
];

const response = await client.chatWithTools(messages, tools);

if (response.toolCalls) {
  // 处理工具调用
  for (const call of response.toolCalls) {
    console.log('Tool:', call.function.name);
    console.log('Args:', JSON.parse(call.function.arguments));
  }
}
```

### 切换模型

```javascript
// 运行时切换
client.switchModel('claude-opus-4');

// 或创建多个客户端对比
const gptClient = createClient({ model: 'gpt-4o' });
const claudeClient = createClient({ model: 'claude-sonnet-4' });
```

## 支持的模型

### OpenAI

| 模型 | 输入成本 | 输出成本 | 上下文 |
|------|----------|----------|--------|
| gpt-4o | $0.0025/1K | $0.01/1K | 128K |
| gpt-4o-mini | $0.00015/1K | $0.0006/1K | 128K |
| gpt-4-turbo | $0.01/1K | $0.03/1K | 128K |

### Anthropic

| 模型 | 输入成本 | 输出成本 | 上下文 |
|------|----------|----------|--------|
| claude-opus-4 | $0.015/1K | $0.075/1K | 200K |
| claude-sonnet-4 | $0.003/1K | $0.015/1K | 200K |
| claude-haiku-4 | $0.0003/1K | $0.0015/1K | 200K |

## 成本追踪

### 查看今日使用

```bash
curl http://localhost:3000/api/ai/usage/today \
  -H "Authorization: Bearer YOUR_TOKEN"
```

响应：

```json
{
  "totalCalls": 5,
  "totalCost": 0.0234,
  "totalTokens": 12500,
  "byModel": {
    "gpt-4o-mini": {
      "provider": "openai",
      "calls": 3,
      "cost": 0.0123,
      "inputTokens": 5000,
      "outputTokens": 2000
    },
    "claude-sonnet-4": {
      "provider": "anthropic",
      "calls": 2,
      "cost": 0.0111,
      "inputTokens": 3000,
      "outputTokens": 2500
    }
  }
}
```

### 对比模型表现

```bash
curl http://localhost:3000/api/ai/usage/compare?days=7 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 测试

```bash
# 测试默认模型
node src/ai/llm/test.js

# 对比多个模型
node -e "
const { compareModels } = require('./src/ai/llm/test');
compareModels(['gpt-4o-mini', 'claude-haiku-4']).then(console.log);
"
```

## API 路由

```
GET  /api/ai/models          # 获取可用模型列表
GET  /api/ai/usage/today     # 今日使用统计
GET  /api/ai/usage/history   # 历史统计
GET  /api/ai/usage/compare   # 模型对比
POST /api/ai/config          # 更新配置
```

## 最佳实践

### 1. 模型选择

- **L1 数据解读**：`gpt-4o-mini` 或 `claude-haiku-4`（便宜，足够好）
- **L2 主动诊断**：`gpt-4o` 或 `claude-sonnet-4`（平衡性价比）
- **L3 增长决策**：`claude-opus-4`（最强推理能力）

### 2. 成本控制

- 设置 `AI_MAX_DAILY_COST` 防止超支
- 使用 `AI_COST_ALERT_THRESHOLD` 提前预警
- 定期查看 `/api/ai/usage/compare` 优化模型选择

### 3. 错误处理

```javascript
try {
  const response = await client.chat(messages);
} catch (error) {
  if (error.message.includes('Daily cost limit exceeded')) {
    // 成本超限
    logger.error('AI budget exhausted');
  } else if (error.message.includes('API error')) {
    // API 错误，可以切换到备用模型
    client.switchModel('gpt-4o-mini');
  }
}
```

### 4. 提示词优化

- 明确要求输出格式（JSON、列表等）
- 限制输出长度（减少 output tokens）
- 使用 system message 设定角色和规则
- 对于固定格式，使用 `generateStructured()`

## 下一步

1. 实现 L1 数据解读层（每日自动分析）
2. 添加异常检测器（统计规则）
3. 实现 L2 主动诊断（多维度拆解）
4. 构建工具链（调用现有分析 API）
5. 实现 L3 增长决策（建议生成和追踪）

## 参考

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)
