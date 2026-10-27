/**
 * WebSocket Server - Real-time communication layer
 *
 * Provides real-time updates for:
 * - AI task progress
 * - LLM streaming responses
 * - Alert notifications
 */

const { Server } = require('socket.io');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
function createServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Transport priority: WebSocket first, then long polling fallback
    transports: ['websocket', 'polling'],
    // Connection timeout
    connectTimeout: 5000,
    // Heartbeat settings (ping/pong)
    pingInterval: 25000,
    pingTimeout: 20000
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token
      const user = await verifyToken(token, socket.request);
      socket.user = user;

      logger.info(`[WebSocket] Auth success: user ${user.id}`);
      next();
    } catch (error) {
      logger.error('[WebSocket] Auth error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection event
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    logger.info(`[WebSocket] Client connected: ${socket.id} (user: ${userId})`);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Setup event handlers
    setupEventHandlers(socket);

    // Disconnect event
    socket.on('disconnect', (reason) => {
      logger.info(`[WebSocket] Client disconnected: ${socket.id} (reason: ${reason})`);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error(`[WebSocket] Socket error: ${socket.id}`, error);
    });
  });

  logger.info('[WebSocket] Server initialized');
  return io;
}

/**
 * Verify JWT token
 */
async function verifyToken(token, req) {
  const user = require('../middleware/sessionUser')(token, req);
  if (!user) throw new Error('Authentication failed');
  return {...user, id: user.user_id};
}

/**
 * Setup event handlers for a socket connection
 */
function setupEventHandlers(socket) {
  const jobProgress = require('./handlers/jobProgress');
  const llmStream = require('./handlers/llmStream');
  const alerts = require('./handlers/alerts');

  // Subscribe to job progress
  socket.on('subscribe:job', async (jobId) => {
    try {
      const status = await require('../queues/queues').getJobStatus('aiAnalysis', String(jobId));
      if (status.data?.ownerId !== socket.user.id) return socket.emit('error', {message: 'Access denied'});
      jobProgress.subscribe(socket, jobId);
    } catch { socket.emit('error', {message: 'Job unavailable'}); }
  });

  socket.on('unsubscribe:job', (jobId) => {
    jobProgress.unsubscribe(socket, jobId);
  });

  // Subscribe to LLM streaming
  socket.on('subscribe:llm-stream', (streamId) => {
    socket.emit('error', {message: '请使用已认证任务状态接口获取分析结果'});
  });

  // Subscribe to alerts
  socket.on('subscribe:alerts', () => {
    alerts.subscribe(socket);
  });

  socket.on('unsubscribe:alerts', () => {
    alerts.unsubscribe(socket);
  });

  // Client ping (test connection)
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ pong: true, timestamp: Date.now() });
    }
  });
}

/**
 * Get Socket.IO instance
 * @returns {Server} Socket.IO server instance
 */
function getIO() {
  if (!io) {
    throw new Error('WebSocket server not initialized');
  }
  return io;
}

/**
 * Emit event to specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emit event to specific room
 * @param {string} room - Room name
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

/**
 * Broadcast event to all connected clients
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function broadcast(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Get count of online users
 * @returns {Promise<number>} Number of connected clients
 */
async function getOnlineUsers() {
  if (!io) return 0;
  const sockets = await io.fetchSockets();
  return sockets.length;
}

/**
 * Get room statistics
 * @returns {Array<{room: string, subscribers: number}>} Room statistics
 */
function getRoomStats() {
  if (!io) return [];

  const rooms = io.sockets.adapter.rooms;
  const stats = [];

  rooms.forEach((sockets, room) => {
    // Skip individual socket IDs (they create their own rooms)
    if (sockets.size === 1 && sockets.has(room)) return;

    stats.push({
      room,
      subscribers: sockets.size
    });
  });

  return stats;
}

module.exports = {
  createServer,
  getIO,
  emitToUser,
  emitToRoom,
  broadcast,
  getOnlineUsers,
  getRoomStats
};
