/**
 * LLM Stream Handler - Real-time streaming of LLM responses
 *
 * Provides ChatGPT-like streaming experience:
 * - Token-by-token output
 * - Progress indicators
 * - Error handling
 */

const { emitToRoom } = require('../server');
const logger = require('../../utils/logger');

/**
 * Subscribe to LLM stream
 * @param {Socket} socket - Socket.IO socket
 * @param {string} streamId - Stream ID
 */
function subscribe(socket, streamId) {
  const room = `llm-stream:${streamId}`;
  socket.join(room);
  logger.debug(`[LLMStream] Socket ${socket.id} subscribed to ${room}`);

  socket.emit('subscribed', { type: 'llm-stream', streamId });
}

/**
 * Unsubscribe from LLM stream
 * @param {Socket} socket - Socket.IO socket
 * @param {string} streamId - Stream ID
 */
function unsubscribe(socket, streamId) {
  const room = `llm-stream:${streamId}`;
  socket.leave(room);
  logger.debug(`[LLMStream] Socket ${socket.id} unsubscribed from ${room}`);
}

/**
 * Emit a single token (word/chunk)
 * @param {string} streamId - Stream ID
 * @param {string} token - Token content
 */
function emitToken(streamId, token) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:token', {
    streamId,
    token,
    timestamp: Date.now()
  });
}

/**
 * Emit stream start notification
 * @param {string} streamId - Stream ID
 * @param {object} metadata - Stream metadata
 */
function emitStart(streamId, metadata = {}) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:start', {
    streamId,
    ...metadata,
    timestamp: Date.now()
  });

  logger.info(`[LLMStream] Stream ${streamId} started`);
}

/**
 * Emit stream completion
 * @param {string} streamId - Stream ID
 * @param {string} fullResponse - Complete response text
 * @param {object} metadata - Additional metadata (usage, cost, etc.)
 */
function emitComplete(streamId, fullResponse, metadata = {}) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:complete', {
    streamId,
    content: fullResponse,
    ...metadata,
    timestamp: Date.now()
  });

  logger.info(`[LLMStream] Stream ${streamId} completed (${fullResponse.length} chars)`);
}

/**
 * Emit stream error
 * @param {string} streamId - Stream ID
 * @param {Error} error - Error object
 */
function emitError(streamId, error) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:error', {
    streamId,
    error: error.message,
    timestamp: Date.now()
  });

  logger.error(`[LLMStream] Stream ${streamId} error:`, error.message);
}

/**
 * Emit thinking/processing indicator
 * @param {string} streamId - Stream ID
 * @param {string} status - Status message (e.g., "Analyzing data...", "Generating response...")
 */
function emitThinking(streamId, status) {
  emitToRoom(`llm-stream:${streamId}`, 'llm:thinking', {
    streamId,
    status,
    timestamp: Date.now()
  });
}

module.exports = {
  subscribe,
  unsubscribe,
  emitToken,
  emitStart,
  emitComplete,
  emitError,
  emitThinking
};
