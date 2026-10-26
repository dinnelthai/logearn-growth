# Phase 3: WebSocket 实时推送 - 快速启动指南

## 一、功能概述

Phase 3 实现了 WebSocket 实时通信层,提供:

1. **任务进度实时推送** - AI 分析任务进度 0% → 100%
2. **LLM 流式输出** - 像 ChatGPT 一样逐字显示
3. **实时告警通知** - 异常检测、任务完成等即时通知
4. **自动重连机制** - 断线自动恢复

## 二、架构设计

```
┌─────────────────────────────────────────────┐
│           前端 (Browser)                     │
│  React Components + Socket.IO Client        │
└─────────────────────────────────────────────┘
                    ↓ WebSocket
┌─────────────────────────────────────────────┐
│         WebSocket Server (Socket.IO)        │
│  ┌────────────────────────────────────────┐ │
│  │  Rooms / Channels                      │ │
│  │  - job:{jobId}      (任务进度)        │ │
│  │  - llm-stream:{id}  (LLM 流式)        │ │
│  │  - user:{userId}    (用户专属)        │ │
│  │  - alerts           (告警广播)        │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         ↑                          ↑
    Bull Worker              LLM Client
    (任务队列)                (AI 调用)
```

## 三、快速开始

### 1. 检查依赖

```bash
cd backend
npm list socket.io uuid
```

应该看到:
```
├── socket.io@4.8.1
└── uuid@11.0.3
```

如果没有安装,运行:
```bash
npm install socket.io@^4.8.1 uuid@^11.0.3
```

### 2. 配置环境变量

```bash
# backend/.env
WS_PORT=3000                                    # WebSocket 端口(和 HTTP 同端口)
WS_CORS_ORIGIN=http://localhost:5173,http://localhost:5174
WS_PING_INTERVAL=25000                          # 心跳间隔(毫秒)
WS_PING_TIMEOUT=20000                           # 心跳超时
```

### 3. 启动服务

WebSocket 已集成到主服务器:

```bash
# 启动后端(包含 WebSocket)
npm run dev

# 或生产模式
npm start
```

启动时应该看到:
```
WebSocket server initialized
Backend (HTTP + WebSocket) running on http://localhost:3000
```

### 4. 测试 WebSocket

运行自动化测试:

```bash
npm run test:websocket
```

测试会验证:
- ✅ WebSocket 连接
- ✅ Ping/Pong 心跳
- ✅ 任务进度推送
- ✅ LLM 流式输出
- ✅ 告警通知

## 四、后端使用方式

### 1. 在 Bull Worker 中推送进度

Worker 已自动集成 WebSocket:

```javascript
// src/queues/workers/aiAnalysisWorker.js (已实现)
// Worker 会自动推送进度

// 在你的任务处理函数中:
async function anomalyDetection(job) {
  // 进度会自动通过 WebSocket 推送
  await job.progress(10);  // → WebSocket emits 10%
  
  // 进行分析...
  
  await job.progress(50);  // → WebSocket emits 50%
  
  // 完成
  return result;           // → WebSocket emits 100% + result
}
```

### 2. LLM 流式输出

使用 `chatStream()` 方法:

```javascript
const { createClient } = require('./ai/llm');

const client = createClient();

// 流式调用
const { streamId, content } = await client.chatStream(messages, {
  userId: 'user-123',
  streamId: 'custom-stream-id' // 可选,自动生成
});

// WebSocket 会自动推送每个 token
// 前端订阅 streamId 就能看到实时输出
```

### 3. 发送告警

```javascript
const { alerts } = require('../websocket');

// 发送用户告警
alerts.emitUserAlert('user-123', {
  type: 'warning',      // info, warning, error, success
  title: 'Anomaly Detected',
  message: 'Active users dropped by 15%',
  data: { metric: 'active_users', change: -15 }
});

// 广播告警
alerts.emitBroadcastAlert({
  type: 'info',
  title: 'System Maintenance',
  message: 'Scheduled maintenance in 1 hour'
});
```

### 4. 手动推送进度

如果不使用 Bull 队列:

```javascript
const { jobProgress } = require('../websocket');

// 开始任务
jobProgress.emitStarted('task-123', { type: 'export' });

// 更新进度
jobProgress.emitProgress('task-123', 30, { step: 'Processing...' });

// 完成
jobProgress.emitCompleted('task-123', { file: 'export.csv' });

// 失败
jobProgress.emitFailed('task-123', new Error('Export failed'));
```

## 五、前端集成

### 1. 安装依赖

```bash
cd frontend
npm install socket.io-client
```

### 2. 创建 WebSocket 客户端

```javascript
// frontend/src/websocket/client.js
import { io } from 'socket.io-client';

class WebSocketClient {
  constructor() {
    this.socket = null;
  }

  connect(token) {
    this.socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️  WebSocket disconnected:', reason);
    });

    return this.socket;
  }

  subscribeJob(jobId, callbacks) {
    this.socket.emit('subscribe:job', jobId);

    this.socket.on('job:progress', (data) => {
      if (data.jobId === jobId && callbacks.onProgress) {
        callbacks.onProgress(data);
      }
    });

    this.socket.on('job:completed', (data) => {
      if (data.jobId === jobId && callbacks.onComplete) {
        callbacks.onComplete(data);
      }
    });
  }
}

export default new WebSocketClient();
```

### 3. React Hook: 任务进度

```javascript
// frontend/src/hooks/useJobProgress.js
import { useEffect, useState } from 'react';
import wsClient from '../websocket/client';

export function useJobProgress(jobId) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    wsClient.subscribeJob(jobId, {
      onProgress: (data) => {
        setProgress(data.progress);
        setStatus('running');
      },
      onComplete: (data) => {
        setProgress(100);
        setStatus('completed');
        setResult(data.result);
      }
    });
  }, [jobId]);

  return { progress, status, result };
}
```

### 4. 使用示例

```javascript
// frontend/src/pages/AnalysisPage.jsx
import { useState } from 'react';
import { useJobProgress } from '../hooks/useJobProgress';

export default function AnalysisPage() {
  const [jobId, setJobId] = useState(null);
  const { progress, status, result } = useJobProgress(jobId);

  const handleAnalyze = async () => {
    // 创建任务
    const res = await fetch('/api/queue/ai-analysis', {
      method: 'POST',
      body: JSON.stringify({
        type: 'anomaly-detection',
        data: { date: '2026-10-26', metrics: ['active_users'] }
      })
    });
    
    const { jobId } = await res.json();
    setJobId(jobId); // WebSocket 自动订阅
  };

  return (
    <div>
      <button onClick={handleAnalyze}>开始分析</button>
      
      {status === 'running' && (
        <div>
          <div>分析中: {progress}%</div>
          <progress value={progress} max={100} />
        </div>
      )}
      
      {status === 'completed' && (
        <div>分析完成: {JSON.stringify(result)}</div>
      )}
    </div>
  );
}
```

## 六、API 端点

### WebSocket 管理 API

所有路由需要认证(`requireAuth`):

#### GET /api/websocket/stats
获取 WebSocket 统计信息

```bash
curl http://localhost:3000/api/websocket/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

响应:
```json
{
  "onlineUsers": 5,
  "rooms": [
    { "room": "job:123", "subscribers": 1 },
    { "room": "user:456", "subscribers": 1 }
  ],
  "totalRooms": 12
}
```

#### POST /api/websocket/test/job
测试任务进度推送

```bash
curl -X POST http://localhost:3000/api/websocket/test/job \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "my-test-job"}'
```

#### POST /api/websocket/test/stream
测试 LLM 流式输出

```bash
curl -X POST http://localhost:3000/api/websocket/test/stream \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"streamId": "my-test-stream", "message": "Hello!"}'
```

#### POST /api/websocket/test/alert
测试告警通知

```bash
curl -X POST http://localhost:3000/api/websocket/test/alert \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 七、WebSocket 事件清单

### 客户端 → 服务器

| 事件 | 参数 | 说明 |
|------|------|------|
| `subscribe:job` | `jobId` | 订阅任务进度 |
| `unsubscribe:job` | `jobId` | 取消订阅任务 |
| `subscribe:llm-stream` | `streamId` | 订阅 LLM 流 |
| `subscribe:alerts` | - | 订阅告警 |
| `unsubscribe:alerts` | - | 取消订阅告警 |
| `ping` | `callback` | 心跳测试 |

### 服务器 → 客户端

| 事件 | 数据 | 说明 |
|------|------|------|
| `job:started` | `{jobId, ...}` | 任务开始 |
| `job:progress` | `{jobId, progress, step}` | 进度更新 |
| `job:completed` | `{jobId, result}` | 任务完成 |
| `job:failed` | `{jobId, error}` | 任务失败 |
| `llm:start` | `{streamId, model}` | 流开始 |
| `llm:token` | `{streamId, token}` | 单个 token |
| `llm:complete` | `{streamId, content}` | 流完成 |
| `llm:error` | `{streamId, error}` | 流错误 |
| `alert` | `{type, title, message}` | 告警通知 |
| `subscribed` | `{type, ...}` | 订阅确认 |

## 八、监控和调试

### 1. 查看在线用户

```bash
curl http://localhost:3000/api/websocket/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. 查看 WebSocket 日志

日志包含:
- 连接/断开事件
- 订阅/取消订阅
- 推送事件

```bash
# 查看实时日志
npm run dev

# 生产环境
pm2 logs logearn-backend | grep WebSocket
```

### 3. 使用浏览器开发工具

Chrome DevTools → Network → WS → 查看 WebSocket 帧

## 九、生产部署

### 1. PM2 配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'logearn-backend',
      script: './src/index.js',
      instances: 1,  // WebSocket 需要单实例或使用 Redis Adapter
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
```

### 2. Nginx 配置

```nginx
# WebSocket 代理配置
location / {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  
  # WebSocket 超时设置
  proxy_read_timeout 86400;
}
```

### 3. 多实例部署(高级)

如果需要多个后端实例,使用 Redis Adapter:

```bash
npm install @socket.io/redis-adapter redis
```

```javascript
// src/websocket/server.js (添加)
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## 十、故障排查

### 问题 1: WebSocket 连接失败

**症状**: `connect_error: Authentication error`

**原因**: Token 无效或未提供

**解决**:
```javascript
// 前端确保传递 token
const socket = io(WS_URL, {
  auth: { token: yourJWTToken }
});
```

### 问题 2: 事件不触发

**症状**: 订阅了任务但没收到进度

**原因**: 
1. 未订阅正确的 jobId
2. Worker 未启动

**解决**:
```bash
# 确保 Worker 运行
npm run worker:ai

# 检查 jobId 是否正确
console.log('Subscribing to:', jobId);
```

### 问题 3: 频繁断线重连

**症状**: 连接不稳定,频繁重连

**原因**: 
1. 网络不稳定
2. 服务器重启
3. 心跳超时

**解决**:
```javascript
// 调整心跳配置
const socket = io(WS_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});
```

### 问题 4: Nginx 代理 WebSocket 失败

**症状**: HTTP 连接成功,WebSocket 失败

**原因**: Nginx 未配置 Upgrade 头

**解决**: 参考上面的 Nginx 配置

## 十一、性能指标

### 预期性能

| 指标 | 目标值 |
|------|--------|
| 连接建立时间 | < 500ms |
| Ping 延迟 | < 100ms |
| 每秒事件吞吐 | > 1000 |
| 并发连接数 | > 1000 |
| 内存占用(每连接) | ~10KB |

### 监控

```bash
# 查看 WebSocket 统计
curl http://localhost:3000/api/websocket/stats
```

## 十二、下一步

Phase 3 完成后,你可以:

1. **添加更多实时功能**
   - 实时数据刷新
   - 协作编辑
   - 用户在线状态

2. **进入 Phase 4: RAG 向量检索**
   - 历史经验学习
   - 知识库问答
   - 智能推荐

3. **集成前端界面**
   - 实时进度条
   - ChatGPT 风格对话
   - 通知中心

## 十三、资源和文档

- [Socket.IO 官方文档](https://socket.io/docs/v4/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [源码: /backend/src/websocket/](../../../backend/src/websocket/)
- [测试: /backend/test/test-websocket.js](../../../backend/test/test-websocket.js)

---

**Phase 3 完成! 🎉**

现在你有了:
- ✅ 实时任务进度推送
- ✅ LLM 流式输出
- ✅ 告警通知系统
- ✅ 自动重连机制

准备好进入 Phase 4 (RAG 向量检索) 了吗?
