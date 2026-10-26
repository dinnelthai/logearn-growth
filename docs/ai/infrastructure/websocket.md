# WebSocket 实时通信实施文档

## 一、概述

WebSocket 在 AI Growth Agent 中用于实时推送：
- ✅ AI 分析进度（0% → 100%）
- ✅ 流式 LLM 输出（逐字显示）
- ✅ 任务状态变更通知
- ✅ 异常告警实时推送

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      前端客户端                               │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │  Dashboard   │  Analysis    │  Reports     │             │
│  │  Page        │  Page        │  Page        │             │
│  └──────────────┴──────────────┴──────────────┘             │
│           ↓ WebSocket          ↓               ↓             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   WebSocket Server                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Connection Manager                                     │ │
│  │  - 管理所有客户端连接                                    │ │
│  │  - 处理认证和权限                                       │ │
│  │  - 分发消息到订阅者                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Event Channels (Room-based)                           │ │
│  │  - job:{jobId}        (任务进度)                       │ │
│  │  - analysis:{date}    (分析结果)                       │ │
│  │  - user:{userId}      (用户专属)                       │ │
│  │  - broadcast          (全局广播)                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│                    事件源                                     │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │ Bull Queue   │ LLM Stream   │ Database     │             │
│  │ Events       │ Events       │ Triggers     │             │
│  └──────────────┴──────────────┴──────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

## 三、技术选型

### 1. Socket.IO vs 原生 WebSocket

| 特性 | Socket.IO | 原生 WebSocket |
|------|-----------|----------------|
| 自动重连 | ✅ | ❌ 需手动实现 |
| 房间/命名空间 | ✅ | ❌ 需手动实现 |
| 广播/多播 | ✅ | ❌ 需手动实现 |
| 回退机制 | ✅ (Long Polling) | ❌ |
| 消息确认 | ✅ | ❌ |
| 二进制支持 | ✅ | ✅ |
| 性能 | 稍低 | 更高 |

**推荐**：使用 **Socket.IO**，功能更完善，开发更快

### 2. 为什么不用 Server-Sent Events (SSE)

SSE 只能服务器→客户端单向通信，WebSocket 双向，更适合我们的场景。

## 四、实现方案

### 1. 文件结构

```
backend/src/websocket/
├── server.js              # WebSocket 服务器初始化
├── connectionManager.js   # 连接管理
├── channels.js            # 频道/房间管理
├── handlers/
│   ├── jobProgress.js     # 任务进度处理
│   ├── llmStream.js       # LLM 流式输出
│   └── alerts.js          # 告警推送
├── middleware/
│   ├── auth.js            # WebSocket 认证
│   └── rateLimit.js       # 速率限制
└── index.js               # 统一导出

frontend/src/websocket/
├── client.js              # WebSocket 客户端封装
├── hooks/
│   ├── useJobProgress.js  # React Hook: 任务进度
│   ├── useLLMStream.js    # React Hook: LLM 流式
│   └── useAlerts.js       # React Hook: 告警
└── reconnect.js           # 重连逻辑
```

### 2. WebSocket 服务器初始化

```javascript
// backend/src/websocket/server.js
const { Server } = require('socket.io');
const { verifyToken } = require('../middleware/requireAuth');
const logger = require('../utils/logger');

let io = null;

/**
 * 初始化 WebSocket 服务器
 */
function createServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // 传输方式优先级
    transports: ['websocket', 'polling'],
    // 连接超时
    connectTimeout: 5000,
    // Ping 间隔（心跳检测）
    pingInterval: 25000,
    pingTimeout: 20000
  });

  // 认证中间件
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // 验证 JWT token
      const user = await verifyToken(token);
      socket.user = user;
      
      logger.info(`WebSocket auth success: ${user.id}`);
      next();
    } catch (error) {
      logger.error('WebSocket auth error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // 连接事件
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    logger.info(`Client connected: ${socket.id} (user: ${userId})`);

    // 加入用户专属房间
    socket.join(`user:${userId}`);

    // 处理客户端事件
    setupEventHandlers(socket);

    // 断开连接
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id} (reason: ${reason})`);
    });

    // 错误处理
    socket.on('error', (error) => {
      logger.error(`Socket error: ${socket.id}`, error);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * 设置事件处理器
 */
function setupEventHandlers(socket) {
  const jobProgress = require('./handlers/jobProgress');
  const llmStream = require('./handlers/llmStream');
  const alerts = require('./handlers/alerts');

  // 订阅任务进度
  socket.on('subscribe:job', (jobId) => {
    jobProgress.subscribe(socket, jobId);
  });

  socket.on('unsubscribe:job', (jobId) => {
    jobProgress.unsubscribe(socket, jobId);
  });

  // 订阅 LLM 流式输出
  socket.on('subscribe:llm-stream', (streamId) => {
    llmStream.subscribe(socket, streamId);
  });

  // 订阅告警
  socket.on('subscribe:alerts', () => {
    alerts.subscribe(socket);
  });

  // 客户端 ping（测试连接）
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ pong: true, timestamp: Date.now() });
    }
  });
}

/**
 * 获取 Socket.IO 实例
 */
function getIO() {
  if (!io) {
    throw new Error('WebSocket server not initialized');
  }
  return io;
}

/**
 * 向特定用户发送消息
 */
function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * 向特定房间发送消息
 */
function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

/**
 * 全局广播
 */
function broadcast(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/**
 * 获取在线用户数
 */
async function getOnlineUsers() {
  if (!io) return 0;
  const sockets = await io.fetchSockets();
  return sockets.length;
}

module.exports = {
  createServer,
  getIO,
  emitToUser,
  emitToRoom,
  broadcast,
  getOnlineUsers
};
```

### 3. 任务进度处理器

```javascript
// backend/src/websocket/handlers/jobProgress.js
const { emitToRoom } = require('../server');
const logger = require('../../utils/logger');

/**
 * 订阅任务进度
 */
function subscribe(socket, jobId) {
  const room = `job:${jobId}`;
  socket.join(room);
  logger.debug(`Socket ${socket.id} subscribed to ${room}`);
  
  // 发送确认
  socket.emit('subscribed', { type: 'job', jobId });
}

/**
 * 取消订阅
 */
function unsubscribe(socket, jobId) {
  const room = `job:${jobId}`;
  socket.leave(room);
  logger.debug(`Socket ${socket.id} unsubscribed from ${room}`);
}

/**
 * 发送任务进度更新
 */
function emitProgress(jobId, progress, data = {}) {
  emitToRoom(`job:${jobId}`, 'job:progress', {
    jobId,
    progress,
    ...data,
    timestamp: Date.now()
  });
}

/**
 * 发送任务完成通知
 */
function emitCompleted(jobId, result) {
  emitToRoom(`job:${jobId}`, 'job:completed', {
    jobId,
    result,
    timestamp: Date.now()
  });
}

/**
 * 发送任务失败通知
 */
function emitFailed(jobId, error) {
  emitToRoom(`job:${jobId}`, 'job:failed', {
    jobId,
    error: error.message || 'Unknown error',
    timestamp: Date.now()
  });
}

module.exports = {
  subscribe,
  unsubscribe,
  emitProgress,
  emitCompleted,
  emitFailed
};
```

### 4. LLM 流式输出处理器

```javascript
// backend/src/websocket/handlers/llmStream.js
const { emitToRoom } = require('../server');
const logger = require('../../utils/logger');

/**
 * 订阅 LLM 流式输出
 */
function subscribe(socket, streamId) {
  const room = `llm-stream:${streamId}`;
  socket.join(room);
  logger.debug(`Socket ${socket.id} subscribed to ${room}`);
  
  socket.emit('subscribed', { type: 'llm-stream', streamId });
}

/**
 * 发送 token（单个词）
 */
function emitToken(streamId, token) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:token', {
    streamId,
    token,
    timestamp: Date.now()
  });
}

/**
 * 发送完整响应（流结束）
 */
function emitComplete(streamId, fullResponse) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:complete', {
    streamId,
    content: fullResponse,
    timestamp: Date.now()
  });
}

/**
 * 发送错误
 */
function emitError(streamId, error) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:error', {
    streamId,
    error: error.message,
    timestamp: Date.now()
  });
}

module.exports = {
  subscribe,
  emitToken,
  emitComplete,
  emitError
};
```

### 5. 集成到 Bull 队列

```javascript
// backend/src/queues/workers/aiAnalysisWorker.js (修改)
const jobProgress = require('../../websocket/handlers/jobProgress');

const aiAnalysisWorker = new Worker(
  'ai-analysis',
  async (job) => {
    // 发送开始通知
    jobProgress.emitProgress(job.id, 0, { status: 'started' });
    
    try {
      // 更新进度
      await job.updateProgress(20);
      jobProgress.emitProgress(job.id, 20, { step: 'fetching data' });
      
      // ... 执行任务
      
      await job.updateProgress(100);
      const result = { /* ... */ };
      
      // 发送完成通知
      jobProgress.emitCompleted(job.id, result);
      
      return result;
    } catch (error) {
      // 发送失败通知
      jobProgress.emitFailed(job.id, error);
      throw error;
    }
  },
  config
);
```

### 6. 集成到 LLM 客户端（流式输出）

```javascript
// backend/src/ai/llm/client.js (添加方法)
const llmStream = require('../../websocket/handlers/llmStream');
const { v4: uuidv4 } = require('uuid');

class LLMClient {
  /**
   * 流式调用 LLM
   */
  async chatStream(messages, options = {}) {
    const streamId = options.streamId || uuidv4();
    
    try {
      const stream = await this.provider.chat({
        model: this.model,
        messages,
        stream: true,
        ...options
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          fullResponse += content;
          // 实时推送每个 token
          llmStream.emitToken(streamId, content);
        }
      }

      // 流结束，发送完整响应
      llmStream.emitComplete(streamId, fullResponse);

      return {
        streamId,
        content: fullResponse,
        usage: stream.usage // 最后一个 chunk 才有 usage
      };
    } catch (error) {
      llmStream.emitError(streamId, error);
      throw error;
    }
  }
}
```

### 7. 前端客户端封装

```javascript
// frontend/src/websocket/client.js
import { io } from 'socket.io-client';

class WebSocketClient {
  constructor() {
    this.socket = null;
    this.token = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * 连接 WebSocket
   */
  connect(token) {
    this.token = token;

    this.socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.setupEventHandlers();

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ WebSocket connection error:', error);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(error);
        }
      });
    });
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️  WebSocket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // 服务器主动断开，需要手动重连
        this.socket.connect();
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket reconnection failed');
    });
  }

  /**
   * 订阅任务进度
   */
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
        // 自动取消订阅
        this.unsubscribeJob(jobId);
      }
    });

    this.socket.on('job:failed', (data) => {
      if (data.jobId === jobId && callbacks.onError) {
        callbacks.onError(data);
        this.unsubscribeJob(jobId);
      }
    });
  }

  /**
   * 取消订阅任务
   */
  unsubscribeJob(jobId) {
    this.socket.emit('unsubscribe:job', jobId);
    this.socket.off('job:progress');
    this.socket.off('job:completed');
    this.socket.off('job:failed');
  }

  /**
   * 订阅 LLM 流式输出
   */
  subscribeLLMStream(streamId, callbacks) {
    this.socket.emit('subscribe:llm-stream', streamId);

    this.socket.on('llm:token', (data) => {
      if (data.streamId === streamId && callbacks.onToken) {
        callbacks.onToken(data.token);
      }
    });

    this.socket.on('llm:complete', (data) => {
      if (data.streamId === streamId && callbacks.onComplete) {
        callbacks.onComplete(data.content);
      }
    });

    this.socket.on('llm:error', (data) => {
      if (data.streamId === streamId && callbacks.onError) {
        callbacks.onError(data.error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * 测试连接
   */
  ping() {
    return new Promise((resolve) => {
      this.socket.emit('ping', (response) => {
        resolve(response);
      });
    });
  }
}

// 单例
export default new WebSocketClient();
```

### 8. React Hook: 任务进度

```javascript
// frontend/src/websocket/hooks/useJobProgress.js
import { useEffect, useState } from 'react';
import wsClient from '../client';

export function useJobProgress(jobId) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
      },
      onError: (data) => {
        setStatus('failed');
        setError(data.error);
      }
    });

    return () => {
      wsClient.unsubscribeJob(jobId);
    };
  }, [jobId]);

  return { progress, status, result, error };
}
```

### 9. React Hook: LLM 流式输出

```javascript
// frontend/src/websocket/hooks/useLLMStream.js
import { useEffect, useState } from 'react';
import wsClient from '../client';

export function useLLMStream(streamId) {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!streamId) return;

    setIsStreaming(true);

    wsClient.subscribeLLMStream(streamId, {
      onToken: (token) => {
        setContent((prev) => prev + token);
      },
      onComplete: (fullContent) => {
        setContent(fullContent);
        setIsStreaming(false);
      },
      onError: (err) => {
        setError(err);
        setIsStreaming(false);
      }
    });

    return () => {
      // 清理订阅
    };
  }, [streamId]);

  return { content, isStreaming, error };
}
```

### 10. 前端使用示例

```javascript
// frontend/src/pages/analysis.js
import { useJobProgress } from '../websocket/hooks/useJobProgress';
import { useLLMStream } from '../websocket/hooks/useLLMStream';

export default function AnalysisPage() {
  const [jobId, setJobId] = useState(null);
  const { progress, status, result, error } = useJobProgress(jobId);

  const handleAnalyze = async () => {
    // 创建任务
    const res = await fetch('/api/ai/analysis', {
      method: 'POST',
      body: JSON.stringify({ type: 'anomaly-detection', data: {} })
    });
    const { jobId } = await res.json();
    
    // WebSocket 会自动订阅进度
    setJobId(jobId);
  };

  return (
    <div>
      <button onClick={handleAnalyze}>开始分析</button>
      
      {status === 'running' && (
        <div>
          <div>进度: {progress}%</div>
          <progress value={progress} max={100} />
        </div>
      )}
      
      {status === 'completed' && (
        <div>分析完成: {JSON.stringify(result)}</div>
      )}
      
      {status === 'failed' && (
        <div>分析失败: {error}</div>
      )}
    </div>
  );
}
```

```javascript
// LLM 流式输出示例
function ChatBox() {
  const [streamId, setStreamId] = useState(null);
  const { content, isStreaming } = useLLMStream(streamId);

  const handleAsk = async () => {
    const res = await fetch('/api/ai/ask-stream', {
      method: 'POST',
      body: JSON.stringify({ question: '为什么活跃用户下降？' })
    });
    const { streamId } = await res.json();
    setStreamId(streamId);
  };

  return (
    <div>
      <button onClick={handleAsk}>提问</button>
      <div className="chat-content">
        {content}
        {isStreaming && <span className="cursor">▋</span>}
      </div>
    </div>
  );
}
```

## 五、配置

### 1. 环境变量

```bash
# WebSocket 配置
WS_PORT=3000                       # WebSocket 端口（通常和 HTTP 同端口）
WS_CORS_ORIGIN=http://localhost:5173
WS_PING_INTERVAL=25000             # 心跳间隔（毫秒）
WS_PING_TIMEOUT=20000              # 心跳超时

# 前端
VITE_WS_URL=http://localhost:3000
```

### 2. package.json 依赖

```json
{
  "dependencies": {
    "socket.io": "^4.8.1"           // 后端
  }
}
```

```json
{
  "dependencies": {
    "socket.io-client": "^4.8.1"    // 前端
  }
}
```

## 六、启动集成

```javascript
// backend/src/index.js
const http = require('http');
const app = require('./app'); // Express app
const { createServer: createWSServer } = require('./websocket/server');

const server = http.createServer(app);

// 初始化 WebSocket
createWSServer(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server (HTTP + WebSocket) listening on :${PORT}`);
});
```

```javascript
// frontend/src/main.js
import wsClient from './websocket/client';

// 用户登录后连接 WebSocket
async function onUserLogin(token) {
  try {
    await wsClient.connect(token);
    console.log('WebSocket ready');
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
  }
}

// 用户登出时断开
function onUserLogout() {
  wsClient.disconnect();
}
```

## 七、监控和运维

### 1. 在线用户统计

```javascript
// backend/src/routes/system.js
const { getOnlineUsers } = require('../websocket/server');

router.get('/stats/online', requireAuth, async (req, res) => {
  const count = await getOnlineUsers();
  res.json({ onlineUsers: count });
});
```

### 2. 性能监控

```javascript
// 记录每个房间的订阅数
const { getIO } = require('../websocket/server');

function getRoomStats() {
  const io = getIO();
  const rooms = io.sockets.adapter.rooms;
  
  const stats = [];
  rooms.forEach((sockets, room) => {
    if (!room.startsWith('job:') && !room.startsWith('user:')) return;
    
    stats.push({
      room,
      subscribers: sockets.size
    });
  });
  
  return stats;
}
```

## 八、最佳实践

### 1. 认证和权限

```javascript
// 只允许用户订阅自己的任务
function subscribe(socket, jobId) {
  // 检查任务是否属于该用户
  const job = await getJob(jobId);
  if (job.userId !== socket.user.id) {
    socket.emit('error', { message: 'Unauthorized' });
    return;
  }
  
  socket.join(`job:${jobId}`);
}
```

### 2. 速率限制

```javascript
// 防止客户端频繁订阅
const rateLimit = new Map();

function checkRateLimit(socketId, limit = 10) {
  const key = socketId;
  const now = Date.now();
  const requests = rateLimit.get(key) || [];
  
  // 清理 1 分钟前的请求
  const recent = requests.filter(t => now - t < 60000);
  
  if (recent.length >= limit) {
    return false;
  }
  
  recent.push(now);
  rateLimit.set(key, recent);
  return true;
}
```

### 3. 自动清理断开的订阅

```javascript
// 连接断开时自动清理
socket.on('disconnect', () => {
  // Socket.IO 会自动从所有房间移除
  logger.info(`Cleaned up subscriptions for ${socket.id}`);
});
```

## 九、测试

### 1. 手动测试

```javascript
// 测试 WebSocket 连接
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

socket.on('connect', () => {
  console.log('Connected');
  
  socket.emit('subscribe:job', 'job123');
  
  socket.on('job:progress', (data) => {
    console.log('Progress:', data);
  });
});
```

### 2. 压力测试

```bash
# 使用 artillery 进行压力测试
npm install -g artillery

# artillery.yml
config:
  target: "http://localhost:3000"
  socketio:
    transports: ["websocket"]
  phases:
    - duration: 60
      arrivalRate: 10  # 每秒 10 个新连接

scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "subscribe:job"
          data: "test-job-{{ $uuid }}"
```

```bash
artillery run artillery.yml
```

## 十、故障处理

### 1. WebSocket 连接失败降级

```javascript
// 前端：WebSocket 失败时降级到轮询
if (!wsClient.isConnected()) {
  // 改用 HTTP 轮询
  const interval = setInterval(async () => {
    const status = await fetch(`/api/jobs/${jobId}/status`);
    // ...
  }, 2000);
}
```

### 2. 服务器重启时的连接恢复

```javascript
// Socket.IO 自动重连，但需要重新订阅
socket.on('reconnect', () => {
  // 重新订阅之前的房间
  if (currentJobId) {
    socket.emit('subscribe:job', currentJobId);
  }
});
```

## 十一、下一步

完成 WebSocket 集成后：
1. 实现 RAG 向量检索（历史知识）
2. 优化 LLM 流式输出的缓冲策略
3. 添加多房间广播（如团队频道）
4. 集成 Slack/钉钉 Webhook 通知
