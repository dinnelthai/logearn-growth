/**
 * Job Progress Handler - Real-time task progress updates
 */

const { emitToRoom } = require('../server');
const logger = require('../../utils/logger');

/**
 * Subscribe to job progress updates
 * @param {Socket} socket - Socket.IO socket
 * @param {string} jobId - Job ID to subscribe to
 */
function subscribe(socket, jobId) {
  const room = `job:${jobId}`;
  socket.join(room);
  logger.debug(`[JobProgress] Socket ${socket.id} subscribed to ${room}`);

  // Send subscription confirmation
  socket.emit('subscribed', { type: 'job', jobId });
}

/**
 * Unsubscribe from job progress updates
 * @param {Socket} socket - Socket.IO socket
 * @param {string} jobId - Job ID to unsubscribe from
 */
function unsubscribe(socket, jobId) {
  const room = `job:${jobId}`;
  socket.leave(room);
  logger.debug(`[JobProgress] Socket ${socket.id} unsubscribed from ${room}`);
}

/**
 * Emit job progress update
 * @param {string} jobId - Job ID
 * @param {number} progress - Progress percentage (0-100)
 * @param {object} data - Additional progress data
 */
function emitProgress(jobId, progress, data = {}) {
  emitToRoom(`job:${jobId}`, 'job:progress', {
    jobId,
    progress,
    ...data,
    timestamp: Date.now()
  });

  logger.debug(`[JobProgress] Progress ${progress}% for job ${jobId}`);
}

/**
 * Emit job completed notification
 * @param {string} jobId - Job ID
 * @param {any} result - Job result data
 */
function emitCompleted(jobId, result) {
  emitToRoom(`job:${jobId}`, 'job:completed', {
    jobId,
    result,
    timestamp: Date.now()
  });

  logger.info(`[JobProgress] Job ${jobId} completed`);
}

/**
 * Emit job failed notification
 * @param {string} jobId - Job ID
 * @param {Error} error - Error object
 */
function emitFailed(jobId, error) {
  emitToRoom(`job:${jobId}`, 'job:failed', {
    jobId,
    error: error.message || 'Unknown error',
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    timestamp: Date.now()
  });

  logger.error(`[JobProgress] Job ${jobId} failed:`, error.message);
}

/**
 * Emit job started notification
 * @param {string} jobId - Job ID
 * @param {object} metadata - Job metadata
 */
function emitStarted(jobId, metadata = {}) {
  emitToRoom(`job:${jobId}`, 'job:started', {
    jobId,
    ...metadata,
    timestamp: Date.now()
  });

  logger.info(`[JobProgress] Job ${jobId} started`);
}

module.exports = {
  subscribe,
  unsubscribe,
  emitProgress,
  emitCompleted,
  emitFailed,
  emitStarted
};
