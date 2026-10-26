# AI 分析前端集成 - 部署清单

## 已完成的工作 ✅

### 1. 前端页面开发
- ✅ 创建 AI 分析 API 客户端 (`frontend/src/api/aiAnalysis.js`)
- ✅ 创建 AI 分析页面组件 (`frontend/src/pages/aiAnalysis.js`)
- ✅ 创建页面样式文件 (`frontend/src/pages/aiAnalysis.css`)
- ✅ 在导航菜单中添加 AI 分析入口 (`frontend/index.html`)
- ✅ 在 dashboard 中注册页面 (`frontend/src/dashboard.js`)
- ✅ 更新导航模式映射 (`frontend/src/navigation.js`)

### 2. 功能特性
- ✅ 异常检测任务创建和执行
- ✅ 每日简报任务创建和执行
- ✅ 实时进度显示（WebSocket + 轮询）
- ✅ 队列状态统计
- ✅ 今日使用统计（调用次数、Token、成本）
- ✅ 最近任务列表
- ✅ 任务详情查看
- ✅ 任务结果预览

### 3. 用户体验
- ✅ 响应式设计（移动端 + 桌面端）
- ✅ 暗色模式支持
- ✅ 加载状态显示
- ✅ 错误处理和提示
- ✅ 平滑动画和过渡效果

### 4. 文档
- ✅ 前端集成文档 (`docs/AI_ANALYSIS_FRONTEND.md`)
- ✅ 部署清单 (`docs/AI_ANALYSIS_DEPLOYMENT.md`)
- ✅ 测试脚本 (`scripts/test-ai-analysis.sh`)

## 部署步骤 📦

### 1. 前置条件检查

确保以下服务已安装并运行：

```bash
# Redis (队列依赖)
redis-server --version
# 启动 Redis
redis-server

# Node.js (>=18.0.0)
node --version
npm --version

# PostgreSQL or SQLite (数据存储)
# 确保数据库已配置
```

### 2. 环境变量配置

在 `backend/.env` 中添加必要的配置：

```bash
# LLM API 密钥（至少配置一个）
OPENAI_API_KEY=sk-...
# 或
ANTHROPIC_API_KEY=sk-ant-...

# Redis 配置
REDIS_URL=redis://localhost:6379

# WebSocket 配置（可选，用于实时进度）
# WS_PORT=3001  # 默认与 HTTP 端口相同

# 队列配置
QUEUE_CONCURRENCY=2  # 并发任务数

# CORS 配置（前端地址）
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

### 3. 安装依赖

```bash
# 后端依赖
cd backend
npm install

# 前端依赖
cd ../frontend
npm install
```

### 4. 数据库迁移

```bash
cd backend

# 数据库 schema 会在启动时自动执行
# 确保 src/db/schema.sql 包含队列相关表

# 检查表是否创建成功
sqlite3 backend.db ".tables"
# 应该看到: ai_cost_tracking, growth_activities, cohorts 等
```

### 5. 启动服务

#### 方式 1：独立进程（推荐用于开发）

```bash
# 终端 1: 启动后端服务
cd backend
npm start
# 输出: Backend (HTTP + WebSocket) running on http://localhost:3001

# 终端 2: 启动 AI Worker
cd backend
node src/queues/workers/aiAnalysisWorker.js
# 输出: AI Analysis Worker started

# 终端 3: 启动调度器（可选，用于自动定时任务）
cd backend
node src/queues/scheduler.js
# 输出: Task Scheduler ready

# 终端 4: 启动前端开发服务器
cd frontend
npm run dev
# 输出: Local: http://localhost:5173
```

#### 方式 2：PM2 管理（推荐用于生产）

```bash
# 安装 PM2
npm install -g pm2

# 启动所有服务
pm2 start backend/src/index.js --name "backend"
pm2 start backend/src/queues/workers/aiAnalysisWorker.js --name "ai-worker"
pm2 start backend/src/queues/scheduler.js --name "scheduler"

# 查看状态
pm2 list

# 查看日志
pm2 logs

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all
```

### 6. 验证部署

#### 方式 1：使用测试脚本

```bash
cd scripts
./test-ai-analysis.sh
```

#### 方式 2：手动测试

```bash
# 1. 测试后端健康
curl http://localhost:3001/health
# 应该返回: {"ok":true,"ts":...}

# 2. 登录获取 token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# 记录返回的 token

# 3. 测试队列状态
curl -X GET http://localhost:3001/api/queue/stats/ai-analysis \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. 创建测试任务
curl -X POST http://localhost:3001/api/queue/ai-analysis \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "anomaly-detection",
    "data": {
      "date": "2026-10-25",
      "metrics": ["active_users"],
      "threshold": 15
    }
  }'
```

#### 方式 3：前端测试

1. 访问 `http://localhost:5173`
2. 登录系统（admin / admin123）
3. 点击顶部导航：**数据分析**
4. 点击左侧导航：**AI 分析**
5. 点击「🔍 异常检测」按钮
6. 观察实时进度和结果

### 7. 监控和日志

#### 查看队列状态

```bash
# 使用 Redis CLI
redis-cli

# 查看队列长度
LLEN bull:ai-analysis:waiting
LLEN bull:ai-analysis:active
LLEN bull:ai-analysis:completed
LLEN bull:ai-analysis:failed

# 查看任务详情
HGETALL bull:ai-analysis:123
```

#### 查看应用日志

```bash
# PM2 日志
pm2 logs ai-worker --lines 100

# 或直接查看进程输出
# 日志会显示任务执行情况和错误信息
```

#### 监控 LLM 使用

访问前端 AI 分析页面，可以看到：
- 今日调用次数
- Token 消耗量
- 累计成本

或通过 API 查询：

```bash
curl -X GET http://localhost:3001/api/ai/usage/today \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 生产环境配置建议 🚀

### 1. 性能优化

```bash
# 增加队列并发数
QUEUE_CONCURRENCY=5

# 使用持久化 Redis
# 配置 Redis RDB/AOF
```

### 2. 安全配置

```bash
# 使用强密码
ADMIN_PASSWORD=<strong-password>

# 限制 CORS 来源
CORS_ORIGIN=https://yourdomain.com

# 使用 HTTPS
# 配置 Nginx/Caddy 反向代理
```

### 3. 成本控制

```bash
# 设置速率限制
RATE_LIMIT_MAX_REQUESTS=100  # 每小时最大请求数

# 设置 LLM 调用超时
LLM_TIMEOUT=30000  # 30 秒

# 定期清理旧任务
# 在 scheduler 中添加清理任务
```

### 4. 备份策略

```bash
# 备份数据库
sqlite3 backend/backend.db ".backup backup.db"

# 备份 Redis 数据
redis-cli BGSAVE

# 定期备份日志
pm2 flush  # 清空旧日志
```

## 故障排查 🔧

### 问题 1：任务一直等待

**原因**：Worker 未启动或已崩溃

**解决**：
```bash
# 检查 worker 进程
ps aux | grep aiAnalysisWorker

# 重启 worker
pm2 restart ai-worker

# 查看错误日志
pm2 logs ai-worker --err
```

### 问题 2：WebSocket 连接失败

**原因**：端口被阻止或配置错误

**解决**：
```bash
# 检查端口监听
lsof -i :3001

# 检查防火墙
# 系统会自动降级为轮询，不影响核心功能
```

### 问题 3：LLM 调用失败

**原因**：API 密钥无效或余额不足

**解决**：
```bash
# 检查 API 密钥
echo $OPENAI_API_KEY

# 测试 API 连接
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# 查看错误详情
pm2 logs ai-worker | grep "LLM"
```

### 问题 4：前端页面空白

**原因**：路由未正确配置或权限问题

**解决**：
```bash
# 检查浏览器控制台错误
# 清除浏览器缓存
# 确认用户已登录

# 检查前端构建
cd frontend
npm run build
```

## 下一步计划 📋

### 短期（1周内）
- [ ] 添加更多分析类型（周趋势、月度报告）
- [ ] 优化 WebSocket 重连逻辑
- [ ] 添加任务取消功能
- [ ] 完善错误提示和用户引导

### 中期（1个月内）
- [ ] 添加分析结果导出（PDF、CSV）
- [ ] 集成 Slack/Email 通知
- [ ] 添加分析模板和自定义配置
- [ ] 实现分析结果对比功能

### 长期（3个月内）
- [ ] 添加 AI 助手聊天功能
- [ ] 实现智能推荐系统
- [ ] 添加自定义 Prompt 功能
- [ ] 集成更多 LLM 提供商

## 联系和支持 📞

- **文档**：查看 `docs/AI_ANALYSIS_FRONTEND.md`
- **测试**：运行 `scripts/test-ai-analysis.sh`
- **问题**：查看 GitHub Issues 或项目文档

---

**部署日期**: 2026-10-26  
**版本**: 1.0.0  
**状态**: ✅ 已完成，可用于生产
