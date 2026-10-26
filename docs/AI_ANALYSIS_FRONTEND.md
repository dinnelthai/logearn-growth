# AI 分析前端集成文档

## 概述

AI 分析页面是一个全新的前端模块，提供了自动异常检测、每日简报和增长洞察的可视化界面。

## 功能特性

### 1. 异常检测
- **自动触发**：每天早上 9 点自动运行（通过后端调度器）
- **手动触发**：在 AI 分析页面点击「异常检测」按钮
- **实时进度**：通过 WebSocket 实时显示任务进度
- **结果展示**：显示检测到的异常指标及变化幅度

### 2. 每日简报
- **自动触发**：每天早上 8 点自动生成
- **手动触发**：在 AI 分析页面点击「每日简报」按钮
- **AI 生成**：使用 LLM 分析当日数据趋势
- **历史记录**：查看最近 20 条分析记录

### 3. 实时进度显示
- **WebSocket 连接**：实时接收任务进度更新
- **进度条**：可视化显示任务执行进度
- **状态标签**：等待中、执行中、已完成、失败等状态
- **自动刷新**：任务完成后自动刷新列表

### 4. 队列统计
- **队列状态**：等待中、执行中、已完成、失败任务数量
- **今日使用**：显示 LLM 调用次数、Token 消耗和成本
- **成本追踪**：跟踪不同模型的使用情况

## 文件结构

```
frontend/src/
├── api/
│   └── aiAnalysis.js          # AI 分析 API 客户端
├── pages/
│   ├── aiAnalysis.js          # AI 分析页面组件
│   └── aiAnalysis.css         # AI 分析页面样式
└── dashboard.js               # 页面注册（已更新）

frontend/index.html            # 导航菜单（已更新）
```

## API 端点

### 创建异常检测任务
```javascript
POST /api/queue/ai-analysis
{
  "type": "anomaly-detection",
  "data": {
    "date": "2026-10-25",
    "metrics": ["active_users", "new_users", "returning_users"],
    "threshold": 15,
    "source": "all"
  },
  "priority": 1
}
```

### 创建每日简报任务
```javascript
POST /api/queue/ai-analysis
{
  "type": "daily-report",
  "data": {
    "date": "2026-10-25",
    "metrics": ["active_users", "new_users", "returning_users"],
    "source": "all"
  },
  "priority": 2
}
```

### 获取任务状态
```javascript
GET /api/queue/jobs/ai-analysis/:jobId
```

### 获取队列统计
```javascript
GET /api/queue/stats/ai-analysis
```

### 获取最近完成的任务
```javascript
GET /api/queue/ai-analysis/jobs?state=completed&limit=10
```

### 获取今日使用统计
```javascript
GET /api/ai/usage/today
```

## 使用方法

### 1. 启动后端服务

确保后端服务已启动并运行 AI 分析 worker：

```bash
cd backend

# 启动主服务
npm start

# 启动 AI 分析 worker（另一个终端）
node src/queues/workers/aiAnalysisWorker.js

# 启动调度器（可选，用于自动定时任务）
node src/queues/scheduler.js
```

### 2. 访问 AI 分析页面

1. 打开浏览器访问前端地址（如 `http://localhost:5173`）
2. 登录系统
3. 点击顶部导航的「数据分析」
4. 点击左侧子导航的「AI 分析」

### 3. 运行异常检测

1. 在 AI 分析页面点击「🔍 异常检测」按钮
2. 确认检测日期和指标
3. 等待任务执行（实时显示进度）
4. 查看检测结果

### 4. 生成每日简报

1. 在 AI 分析页面点击「📊 每日简报」按钮
2. 确认简报日期
3. 等待 AI 生成简报（实时显示进度）
4. 查看简报内容

### 5. 查看历史记录

- 页面下方显示最近 20 条完成的分析记录
- 点击任意记录可查看详细结果
- 支持查看异常检测的具体指标和变化

## WebSocket 支持

AI 分析页面支持通过 WebSocket 实时接收任务进度更新：

```javascript
// WebSocket 连接地址
ws://localhost:3001/ws

// 进度消息格式
{
  "type": "job:progress",
  "jobId": "123",
  "progress": 50,
  "data": {
    "step": "Analyzing data..."
  }
}
```

如果 WebSocket 不可用，系统会自动降级为轮询模式（每 5 秒）。

## 样式定制

AI 分析页面使用模块化 CSS，支持浅色和暗色模式：

- **主题变量**：使用 CSS 变量定义颜色
- **响应式设计**：支持移动端和桌面端
- **状态标签**：不同状态使用不同颜色
- **动画效果**：进度条和状态变化有平滑过渡

## 扩展开发

### 添加新的分析类型

1. 在后端 `backend/src/queues/jobs/aiAnalysis.js` 中添加新的任务类型
2. 在前端 `frontend/src/api/aiAnalysis.js` 中添加对应的 API 方法
3. 在 `frontend/src/pages/aiAnalysis.js` 中添加触发按钮和结果渲染逻辑

### 自定义结果展示

在 `renderJobResult` 函数中添加新的结果类型处理：

```javascript
// 周趋势分析结果
if (job.name === 'weekly-trends') {
  return `
    <div class="ai-job-result">
      <div class="trend-chart">
        ${renderTrendChart(result.trends)}
      </div>
    </div>
  `;
}
```

## 注意事项

1. **LLM API 密钥**：确保在 `.env` 中配置了有效的 OpenAI 或 Anthropic API 密钥
2. **Redis 依赖**：队列系统需要 Redis，确保 Redis 已启动
3. **成本控制**：注意监控 LLM 使用成本，可在 AI 配置页面查看
4. **并发限制**：默认并发限制为 2，可在 `backend/src/queues/queues.js` 中调整
5. **WebSocket 端口**：确保 WebSocket 端口（默认 3001）未被防火墙阻止

## 故障排查

### 任务一直处于等待状态
- 检查 AI worker 是否正常运行
- 检查 Redis 连接是否正常
- 查看 worker 日志是否有错误

### WebSocket 连接失败
- 检查后端是否启用了 WebSocket 支持
- 确认 WebSocket URL 配置正确
- 系统会自动降级为轮询，不影响核心功能

### 异常检测没有结果
- 检查数据是否覆盖指定日期
- 确认阈值设置合理（默认 15%）
- 查看任务详情的错误信息

### LLM 调用失败
- 检查 API 密钥是否有效
- 确认账户余额充足
- 查看错误日志中的具体错误信息

## 下一步

- [ ] 添加更多分析类型（周趋势、月度报告等）
- [ ] 支持分析结果导出（PDF、CSV）
- [ ] 添加分析模板和自定义配置
- [ ] 集成 Slack/Email 通知
- [ ] 添加分析结果对比功能

## 联系方式

如有问题，请查看：
- [AI Growth Agent 完整文档](../AI_GROWTH_AGENT_ALL_PHASES_COMPLETE.md)
- [Phase 4 快速开始](../PHASE4_QUICKSTART.md)
- [项目 README](../README.md)
