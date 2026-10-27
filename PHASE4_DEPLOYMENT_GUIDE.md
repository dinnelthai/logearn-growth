# Phase 4: RAG 向量检索 - 完整部署指南 🚀

## 📋 部署状态

✅ **已完成:**
- RAG 代码实现完成
- @qdrant/js-client-rest 包已安装
- .env 配置已添加
- 测试套件已就绪

⚠️ **待完成:**
- Docker 安装和配置
- Qdrant 容器启动
- OpenAI API Key 配置
- RAG 系统初始化和索引

---

## 🎯 部署方案选择

### 方案 A: Docker 部署 (推荐，生产级)

**优点:**
- 隔离性好
- 易于管理
- 可使用 Docker Compose 统一编排
- 数据持久化

**适合:** 生产环境、完整部署

### 方案 B: 本地进程部署

**优点:**
- 无需 Docker
- 开发调试方便
- 资源占用小

**适合:** 开发测试、快速验证

### 方案 C: 云托管 (Qdrant Cloud)

**优点:**
- 无需维护基础设施
- 自动扩展
- 高可用

**适合:** 快速上线、无运维能力

---

## 🚀 方案 A: Docker 完整部署 (推荐)

### 步骤 1: 安装 Docker

```bash
# macOS
# 下载: https://www.docker.com/products/docker-desktop
# 或使用 Homebrew
brew install --cask docker

# 启动 Docker Desktop
open /Applications/Docker.app

# 验证安装
docker --version
docker ps
```

### 步骤 2: 创建 Docker Compose 配置

```bash
cd /Users/leon/Documents/work/Logearn-growth
nano docker-compose.rag.yml
```

**docker-compose.rag.yml:**

```yaml
version: '3.8'

services:
  # Redis - LLM 缓存
  redis:
    image: redis:7-alpine
    container_name: logearn-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # Qdrant - 向量数据库
  qdrant:
    image: qdrant/qdrant:latest
    container_name: logearn-qdrant
    ports:
      - "6333:6333"  # REST API
      - "6334:6334"  # gRPC (可选)
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  redis_data:
    driver: local
  qdrant_data:
    driver: local
```

### 步骤 3: 启动基础设施

```bash
# 启动 Redis 和 Qdrant
docker-compose -f docker-compose.rag.yml up -d

# 查看容器状态
docker-compose -f docker-compose.rag.yml ps

# 查看日志
docker-compose -f docker-compose.rag.yml logs -f

# 验证 Redis
docker exec -it logearn-redis redis-cli ping
# 应返回: PONG

# 验证 Qdrant
curl http://localhost:6333/
# 应返回: {"title":"qdrant - vector search engine",...}
```

### 步骤 4: 配置 OpenAI API Key

```bash
cd backend
nano .env
```

**修改以下行:**
```bash
# 替换为你的真实 API Key
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx...

# 或使用 Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx...
```

**获取 OpenAI API Key:**
1. 访问: https://platform.openai.com/api-keys
2. 登录/注册
3. 点击 "Create new secret key"
4. 复制并保存 key

### 步骤 5: 初始化 RAG 系统

```bash
cd backend

# 初始化 Qdrant 集合
node src/ai/rag/cli.js init

# 应该看到:
# ✓ RAG system initialized successfully
```

### 步骤 6: 索引知识库

```bash
# 索引历史 findings (最近 1000 条)
node src/ai/rag/cli.js index findings

# 索引 annotations (最近 500 条)
node src/ai/rag/cli.js index annotations

# 或一键索引所有内容
node src/ai/rag/cli.js index all

# 查看统计
node src/ai/rag/cli.js stats
```

### 步骤 7: 测试 RAG 功能

```bash
# CLI 搜索测试
node src/ai/rag/cli.js search "用户留存率下降"

# 运行完整测试套件
npm run test:rag

# 应该看到:
# ✓ embeddings
# ✓ vectordb
# ✓ indexer
# ✓ retriever
# ✓ system
# Passed: 5/5
```

### 步骤 8: 启动完整系统

```bash
# 启动所有服务 (API + Worker + Scheduler)
npm run queue:dev

# 或分别启动
npm run dev         # API + WebSocket
npm run worker:ai   # AI Worker
npm run scheduler   # 定时任务
```

### 步骤 9: 验证部署

```bash
# 健康检查
curl http://localhost:3000/api/rag/health

# 应返回:
# {
#   "ok": true,
#   "initialized": true,
#   "healthy": true,
#   "pointsCount": 1234
# }
```

**完成! Phase 4 部署成功! ✅**

---

## 🔧 方案 B: 本地进程部署 (无 Docker)

### 步骤 1: 安装 Qdrant 原生版本

```bash
# 下载 Qdrant
curl -L https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-apple-darwin.tar.gz -o qdrant.tar.gz

# 解压
tar -xzf qdrant.tar.gz

# 启动 Qdrant
./qdrant

# 应该看到:
# Qdrant server started on http://localhost:6333
```

### 步骤 2: 启动 Redis

```bash
# 安装 Redis
brew install redis

# 启动 Redis
redis-server

# 或作为后台服务
brew services start redis

# 验证
redis-cli ping
# 返回: PONG
```

### 步骤 3-9: 同方案 A

继续执行方案 A 的步骤 4-9。

---

## ☁️ 方案 C: Qdrant Cloud 托管

### 步骤 1: 注册 Qdrant Cloud

1. 访问: https://cloud.qdrant.io
2. 注册账号
3. 创建新集群 (Free tier: 1GB 免费)

### 步骤 2: 获取连接信息

在 Qdrant Cloud 控制台获取:
- **URL:** `https://xxx-xxx.aws.cloud.qdrant.io:6333`
- **API Key:** `xxxxx-xxxx-xxxx`

### 步骤 3: 配置环境变量

```bash
cd backend
nano .env
```

修改:
```bash
QDRANT_URL=https://xxx-xxx.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=xxxxx-xxxx-xxxx
```

### 步骤 4: Redis

选项 A: 本地 Redis (同方案 B)
选项 B: Redis Cloud (https://redis.io/cloud/)

### 步骤 5-9: 同方案 A

继续执行方案 A 的步骤 4-9。

---

## 📊 验证清单

部署完成后，确认以下各项:

### 1. 基础设施

- [ ] Redis 运行 (`redis-cli ping` 返回 PONG)
- [ ] Qdrant 运行 (`curl http://localhost:6333/` 返回版本信息)
- [ ] 容器健康 (`docker ps` 显示 healthy)

### 2. 配置

- [ ] `.env` 文件包含所有 AI/RAG 配置
- [ ] `OPENAI_API_KEY` 已设置 (非空)
- [ ] `QDRANT_URL` 正确
- [ ] `REDIS_URL` 正确

### 3. RAG 系统

- [ ] RAG 初始化成功 (`node src/ai/rag/cli.js init`)
- [ ] 知识库已索引 (`node src/ai/rag/cli.js stats` 显示 points > 0)
- [ ] 搜索功能正常 (`node src/ai/rag/cli.js search "测试"`)
- [ ] 测试全部通过 (`npm run test:rag`)

### 4. API 服务

- [ ] 后端启动成功 (`npm run dev`)
- [ ] WebSocket 连接正常
- [ ] Worker 运行中 (`npm run worker:ai`)
- [ ] 健康检查通过 (`curl /api/rag/health`)

---

## 🐛 常见问题排查

### Q1: Docker 命令不存在

**问题:**
```bash
docker: command not found
```

**解决:**
```bash
# 1. 安装 Docker Desktop
open https://www.docker.com/products/docker-desktop

# 2. 或使用 Homebrew
brew install --cask docker

# 3. 启动 Docker Desktop
open /Applications/Docker.app

# 4. 验证
docker --version
```

### Q2: Qdrant 连接失败

**问题:**
```bash
Error: connect ECONNREFUSED 127.0.0.1:6333
```

**解决:**
```bash
# 检查容器状态
docker ps | grep qdrant

# 重启容器
docker restart logearn-qdrant

# 查看日志
docker logs logearn-qdrant

# 测试连接
curl http://localhost:6333/
```

### Q3: Redis 连接失败

**问题:**
```bash
Error: Redis connection to localhost:6379 failed
```

**解决:**
```bash
# 检查 Redis
docker ps | grep redis

# 重启
docker restart logearn-redis

# 测试
redis-cli ping

# 或
docker exec -it logearn-redis redis-cli ping
```

### Q4: OpenAI API 错误

**问题:**
```bash
Error: Invalid API key
```

**解决:**
```bash
# 1. 检查 .env
grep OPENAI_API_KEY backend/.env

# 2. 验证 key 有效性
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-your-key"

# 3. 重新设置
nano backend/.env
# 修改 OPENAI_API_KEY=sk-proj-...

# 4. 重启服务
npm run dev
```

### Q5: 索引失败 - 表不存在

**问题:**
```bash
Error: relation "ai_findings" does not exist
```

**解决:**
```bash
# 运行数据库迁移
cd backend
npm run migrate

# 或查看 RAG 索引器代码,确认数据源
node src/ai/rag/cli.js index documents  # 使用文档测试
```

### Q6: 搜索结果为空

**问题:**
搜索总是返回空数组

**原因:**
1. 知识库未索引
2. 相似度阈值过高
3. 数据不存在

**解决:**
```bash
# 1. 查看统计
node src/ai/rag/cli.js stats

# 2. 重新索引
node src/ai/rag/cli.js index all

# 3. 降低阈值测试
# 在代码或 API 调用中设置:
{
  "scoreThreshold": 0.5  // 默认 0.7
}
```

### Q7: 端口冲突

**问题:**
```bash
Error: Port 6379 is already in use
```

**解决:**
```bash
# 查看占用端口的进程
lsof -i :6379
lsof -i :6333

# 停止冲突进程
kill -9 <PID>

# 或修改端口
# 编辑 docker-compose.rag.yml
ports:
  - "6380:6379"  # Redis
  - "6335:6333"  # Qdrant

# 同时修改 .env
REDIS_URL=redis://localhost:6380
QDRANT_URL=http://localhost:6335
```

### Q8: Docker 容器无法启动

**问题:**
```bash
Error response from daemon: driver failed programming external connectivity
```

**解决:**
```bash
# 1. 重启 Docker
# macOS: 右键 Docker 图标 → Restart

# 2. 清理旧容器
docker-compose -f docker-compose.rag.yml down -v
docker system prune -a

# 3. 重新启动
docker-compose -f docker-compose.rag.yml up -d
```

---

## 💰 成本估算

### 开发/测试环境

| 项目 | 成本 | 说明 |
|------|------|------|
| Docker 本地部署 | $0 | 使用本地资源 |
| Qdrant 存储 | $0 | 本地磁盘 |
| Redis 存储 | $0 | 本地磁盘 |
| OpenAI Embeddings | ~$0.004 | 初始索引 1000 条 |
| OpenAI 检索 | ~$0.000004/次 | 忽略不计 |
| **总计** | **~$0.01/月** | |

### 生产环境

| 项目 | 成本 | 说明 |
|------|------|------|
| 云服务器 (2 CPU, 4GB) | ~$20/月 | DigitalOcean/AWS |
| Qdrant 本地部署 | $0 | 容器化运行 |
| Redis 本地部署 | $0 | 容器化运行 |
| OpenAI Embeddings | ~$0.12/月 | 增量索引 3000 条/月 |
| OpenAI 检索 | ~$0.12/月 | 1000 次/天 |
| **总计** | **~$20-25/月** | |

### 云托管方案

| 项目 | 成本 | 说明 |
|------|------|------|
| Qdrant Cloud Free | $0 | 1GB 存储 |
| Qdrant Cloud Paid | $25/月 | 10GB 存储 |
| Redis Cloud Free | $0 | 30MB |
| Redis Cloud Paid | $7/月 | 1GB |
| OpenAI Embeddings | ~$0.12/月 | 同上 |
| **总计 (Free)** | **~$0.15/月** | |
| **总计 (Paid)** | **~$32/月** | |

**推荐:** 开发用 Free tier,生产用自建 Docker (~$20/月)

---

## 📚 下一步

### 1. 集成到业务流程

参考 [PHASE4_QUICKSTART.md](./PHASE4_QUICKSTART.md) 中的使用场景:
- 历史经验查询
- API 检索集成
- 避免重复分析

### 2. 前端集成

参考 [QUICKSTART_FRONTEND.md](./QUICKSTART_FRONTEND.md):
- 实时进度显示
- WebSocket 连接
- ChatGPT 风格 UI

### 3. 监控和优化

- 设置 Prometheus 监控
- 配置 Grafana 面板
- 成本追踪和告警

### 4. 定时任务

```javascript
// backend/src/queues/scheduler.js
const cron = require('node-cron');

// 每天凌晨 2:00 重新索引
cron.schedule('0 2 * * *', async () => {
  const indexer = new KnowledgeIndexer();
  await indexer.reindexAll();
});
```

---

## 🎉 完成!

你现在已经完成 Phase 4 的完整部署:

✅ **基础设施就绪**
- Redis 运行中
- Qdrant 运行中
- Docker 编排完成

✅ **RAG 系统就绪**
- 向量数据库初始化
- 知识库已索引
- 检索功能正常

✅ **API 服务就绪**
- 后端服务运行
- WebSocket 连接
- Worker 处理任务

✅ **测试通过**
- 所有测试用例通过
- CLI 工具正常
- API 端点响应

---

## 🚀 立即开始!

```bash
# 1. 启动基础设施
docker-compose -f docker-compose.rag.yml up -d

# 2. 初始化 RAG
cd backend
node src/ai/rag/cli.js init
node src/ai/rag/cli.js index all

# 3. 启动服务
npm run queue:dev

# 4. 测试
npm run test:rag

# 5. 搜索测试
node src/ai/rag/cli.js search "用户留存率下降"
```

**Phase 4 部署完成! 🎉**

---

**相关文档:**
- [Phase 4 快速开始](./PHASE4_QUICKSTART.md)
- [前端集成指南](./QUICKSTART_FRONTEND.md)
- [所有 Phases 完成总结](./AI_GROWTH_AGENT_ALL_PHASES_COMPLETE.md)

**最后更新:** 2026-10-26  
**状态:** ✅ 就绪，待部署
