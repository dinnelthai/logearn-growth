# AI Growth Agent - 快速开始

## ✅ 已完成的工作

我已经完成了 **AI Growth Agent 的 LLM 统一访问层**，支持 OpenAI (ChatGPT) 和 Anthropic (Claude) 双 provider，可以方便地切换和对比效果。

### 新增文件

```
backend/
├── src/ai/llm/
│   ├── config.js              # 多 LLM 配置
│   ├── client.js              # 统一客户端
│   ├── costTracker.js         # 成本追踪
│   ├── providers/
│   │   ├── openai.js          # ChatGPT provider
│   │   └── anthropic.js       # Claude provider
│   ├── test.js                # 测试脚本
│   └── index.js               # 导出入口
├── src/routes/aiConfig.js     # AI 管理 API
├── .env.example               # 环境变量示例
└── src/db/schema.sql          # 新增 AI 相关表

docs/ai/
├── llm-integration.md         # 详细文档
├── implementation-plan.md     # 完整实现方案
└── SETUP.md                   # 本文件
```

### 数据库表

- `ai_usage_logs` - 记录每次 LLM 调用和成本
- `ai_findings` - 异常检测结果
- `ai_investigations` - 维度拆解记录  
- `ai_suggestions` - 增长建议
- `ai_tracking` - 效果追踪

### API 路由

- `GET /api/ai/models` - 可用模型列表
- `GET /api/ai/usage/today` - 今日使用统计
- `GET /api/ai/usage/history` - 历史统计
- `GET /api/ai/usage/compare` - 模型对比

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

新增依赖：
- `openai` - OpenAI SDK
- `@anthropic-ai/sdk` - Anthropic SDK

### 2. 配置环境变量

编辑 `backend/.env`，添加：

```bash
# AI 配置 - 至少配置一个 provider

# OpenAI (ChatGPT)
OPENAI_API_KEY=sk-...
AI_DEFAULT_MODEL=gpt-4o-mini

# 或者 Anthropic (Claude)
# ANTHROPIC_API_KEY=sk-ant-...
# AI_DEFAULT_MODEL=claude-sonnet-4

# 成本控制
AI_MAX_DAILY_COST=5.0
AI_COST_ALERT_THRESHOLD=3.0
```

### 3. 运行数据库迁移

```bash
npm run migrate
```

### 4. 测试 LLM 客户端

```bash
node src/ai/llm/test.js
```

预期输出：
```
Available models:
┌─────────┬──────────────────┬──────────────┬──────────────────┬────────────┐
│ (index) │       name       │   provider   │ costPer1kInput   │  maxTokens │
├─────────┼──────────────────┼──────────────┼──────────────────┼────────────┤
│    0    │   'gpt-4o-mini'  │   'openai'   │      0.00015     │   128000   │
│    1    │   'gpt-4o'       │   'openai'   │      0.0025      │   128000   │
│    2    │'claude-sonnet-4' │ 'anthropic'  │      0.003       │   200000   │
└─────────┴──────────────────┴──────────────┴──────────────────┴────────────┘

=== Testing default ===
Response: 以下是活跃用户下降 15% 可能的三个原因：
1. 产品功能变更或 bug 导致用户体验下降
2. 营销渠道流量质量降低或投放策略调整
3. 竞品活动或季节性因素影响用户活跃度

Stats:
- Duration: 1234 ms
- Input tokens: 123
- Output tokens: 89
- Total tokens: 212
```

### 5. 启动服务

```bash
npm run dev
```

访问 API：
```bash
# 获取可用模型
curl http://localhost:3000/api/ai/models \
  -H "Authorization: Bearer YOUR_TOKEN"

# 查看今日使用
curl http://localhost:3000/api/ai/usage/today \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📖 使用示例

### 基础调用

```javascript
const { createClient } = require('./src/ai/llm');

// 使用默认模型
const client = createClient();

const response = await client.chat([
  { 
    role: 'system', 
    content: 'You are a growth analytics expert.' 
  },
  { 
    role: 'user', 
    content: '活跃用户昨日下降 15%，可能的原因是什么？' 
  }
]);

console.log(response.content);
console.log('Cost: $', client.calculateCost(response.usage));
```

### 切换模型对比

```javascript
// 测试 ChatGPT
const gptClient = createClient({ model: 'gpt-4o-mini' });
const gptResponse = await gptClient.chat(messages);

// 测试 Claude
const claudeClient = createClient({ model: 'claude-haiku-4' });
const claudeResponse = await claudeClient.chat(messages);

// 对比输出质量和成本
console.log('GPT:', {
  content: gptResponse.content.substring(0, 100),
  cost: gptClient.calculateCost(gptResponse.usage)
});

console.log('Claude:', {
  content: claudeResponse.content.substring(0, 100),
  cost: claudeClient.calculateCost(claudeResponse.usage)
});
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
      change: { type: 'number' },
      hypotheses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            likelihood: { 
              type: 'string', 
              enum: ['high', 'medium', 'low'] 
            }
          },
          required: ['reason', 'likelihood']
        }
      }
    },
    required: ['metric', 'change', 'hypotheses']
  }
};

const response = await client.generateStructured(messages, schema);
const result = JSON.parse(response.content);

console.log(result);
// {
//   metric: '活跃用户',
//   change: -15,
//   hypotheses: [
//     { reason: 'Twitter 流量质量下降', likelihood: 'high' },
//     { reason: '产品功能变更', likelihood: 'medium' }
//   ]
// }
```

## 💰 成本预估

### 支持的模型

| 模型 | Provider | 输入 | 输出 | 适用场景 |
|------|----------|------|------|----------|
| gpt-4o-mini | OpenAI | $0.00015/1K | $0.0006/1K | L1 数据解读 |
| gpt-4o | OpenAI | $0.0025/1K | $0.01/1K | L2 主动诊断 |
| claude-haiku-4 | Anthropic | $0.0003/1K | $0.0015/1K | L1 数据解读 |
| claude-sonnet-4 | Anthropic | $0.003/1K | $0.015/1K | L2 主动诊断 |
| claude-opus-4 | Anthropic | $0.015/1K | $0.075/1K | L3 增长决策 |

### 预估每日成本

假设每天：
- L1 数据解读：1 次（生成简报）
- L2 主动诊断：2-3 个异常
- L3 增长决策：按需触发

**使用 gpt-4o-mini：** ~$0.05 - $0.20/天  
**使用 claude-sonnet-4：** ~$0.10 - $0.50/天

## 🎯 下一步

你已经有了 LLM 访问层，现在可以选择：

### 选项 1：先体验效果
```bash
# 运行测试脚本，看看不同模型的输出
node src/ai/llm/test.js

# 或者尝试对比模型
node -e "
const { compareModels } = require('./src/ai/llm/test');
compareModels(['gpt-4o-mini', 'claude-haiku-4']).then(console.log);
"
```

### 选项 2：开始开发 L1 数据解读
按照 `docs/ai/implementation-plan.md` 中的 Phase 1 计划：
1. 实现数据获取工具
2. 实现异常检测器
3. 实现每日自动简报
4. 添加定时任务

### 选项 3：直接看完整实现方案
阅读 `docs/ai/implementation-plan.md` 了解 L1/L2/L3 的完整设计。

## 📚 相关文档

- [llm-integration.md](./llm-integration.md) - LLM 集成详细文档
- [implementation-plan.md](./implementation-plan.md) - 完整实现方案

## ❓ 常见问题

### Q: 我只想用一个 provider，可以吗？
A: 可以，只配置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 其中一个即可。

### Q: 如何切换默认模型？
A: 修改 `.env` 中的 `AI_DEFAULT_MODEL`，然后重启服务。

### Q: 成本会不会失控？
A: 不会，有两层保护：
1. `AI_MAX_DAILY_COST` 硬限制（默认 $5/天）
2. `AI_COST_ALERT_THRESHOLD` 提前预警（默认 $3/天）

### Q: 如何查看实际使用成本？
A: 访问 `/api/ai/usage/today` 查看今日统计。

### Q: 哪个模型更好？
A: 取决于任务：
- 简单任务：`gpt-4o-mini` 便宜又快
- 复杂推理：`claude-sonnet-4` 质量更高
- 最高要求：`claude-opus-4` 推理能力最强

建议先用 `gpt-4o-mini` 开发，有需要再升级。
