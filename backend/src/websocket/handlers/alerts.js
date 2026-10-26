/**
 * Alerts Handler - Real-time alert notifications
 *
 * Provides instant notifications for:
 * - Anomaly detection alerts
 * - Task completion notifications
 * - System alerts
 */

const { emitToUser, broadcast } = require('../server');
const logger = require('../../utils/logger');

const ALERT_ROOMS = new Set(); // Track alert subscribers

/**
 * Subscribe to alerts
 * @param {Socket} socket - Socket.IO socket
 */
function subscribe(socket) {
  const room = 'alerts';
  socket.join(room);
  ALERT_ROOMS.add(socket.id);

  logger.debug(`[Alerts] Socket ${socket.id} subscribed to alerts`);
  socket.emit('subscribed', { type: 'alerts' });
}

/**
 * Unsubscribe from alerts
 * @param {Socket} socket - Socket.IO socket
 */
function unsubscribe(socket) {
  const room = 'alerts';
  socket.leave(room);
  ALERT_ROOMS.delete(socket.id);

  logger.debug(`[Alerts] Socket ${socket.id} unsubscribed from alerts`);
}

/**
 * Send alert to specific user
 * @param {string} userId - User ID
 * @param {object} alert - Alert data
 * @param {string} alert.type - Alert type (info, warning, error, success)
 * @param {string} alert.title - Alert title
 * @param {string} alert.message - Alert message
 * @param {any} alert.data - Additional data
 */
function emitUserAlert(userId, alert) {
  emitToUser(userId, 'alert', {
    ...alert,
    timestamp: Date.now()
  });

  logger.info(`[Alerts] Sent alert to user ${userId}: ${alert.title}`);
}

/**
 * Broadcast alert to all users
 * @param {object} alert - Alert data
 */
function emitBroadcastAlert(alert) {
  broadcast('alert', {
    ...alert,
    timestamp: Date.now()
  });

  logger.info(`[Alerts] Broadcast alert: ${alert.title}`);
}

/**
 * Send anomaly detection alert
 * @param {string} userId - User ID
 * @param {object} anomaly - Anomaly data
 */
function emitAnomalyAlert(userId, anomaly) {
  emitUserAlert(userId, {
    type: 'warning',
    title: 'Anomaly Detected',
    message: `${anomaly.metric} has changed by ${anomaly.change}%`,
    data: anomaly
  });
}

/**
 * Send task completion alert
 * @param {string} userId - User ID
 * @param {object} task - Task data
 */
function emitTaskComplete(userId, task) {
  emitUserAlert(userId, {
    type: 'success',
    title: 'Task Completed',
    message: `${task.name} has finished successfully`,
    data: task
  });
}

/**
 * Send system alert
 * @param {string} type - Alert type (info, warning, error)
 * @param {string} message - Alert message
 */
function emitSystemAlert(type, message) {
  emitBroadcastAlert({
    type,
    title: 'System Notification',
    message
  });
}

/**
 * Get alert subscriber count
 * @returns {number} Number of alert subscribers
 */
function getSubscriberCount() {
  return ALERT_ROOMS.size;
}

module.exports = {
  subscribe,
  unsubscribe,
  emitUserAlert,
  emitBroadcastAlert,
  emitAnomalyAlert,
  emitTaskComplete,
  emitSystemAlert,
  getSubscriberCount
};
