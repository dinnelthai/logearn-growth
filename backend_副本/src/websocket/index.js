/**
 * WebSocket Module - Unified exports
 */

const server = require('./server');
const jobProgress = require('./handlers/jobProgress');
const llmStream = require('./handlers/llmStream');
const alerts = require('./handlers/alerts');

module.exports = {
  // Server functions
  createServer: server.createServer,
  getIO: server.getIO,
  emitToUser: server.emitToUser,
  emitToRoom: server.emitToRoom,
  broadcast: server.broadcast,
  getOnlineUsers: server.getOnlineUsers,
  getRoomStats: server.getRoomStats,

  // Handlers
  jobProgress,
  llmStream,
  alerts
};
