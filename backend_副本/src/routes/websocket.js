/**
 * WebSocket Management API
 *
 * Routes for WebSocket monitoring and management
 */

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');

let websocket;
try {
  websocket = require('../websocket');
} catch (error) {
  console.warn('WebSocket not initialized');
}

/**
 * GET /api/websocket/stats
 * Get WebSocket statistics
 */
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    if (!websocket) {
      return res.status(503).json({ error: 'WebSocket not initialized' });
    }

    const onlineUsers = await websocket.getOnlineUsers();
    const rooms = websocket.getRoomStats();

    res.json({
      onlineUsers,
      rooms: rooms.map(r => ({
        room: r.room,
        subscribers: r.subscribers
      })),
      totalRooms: rooms.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/websocket/broadcast
 * Broadcast message to all connected clients (admin only)
 */
router.post('/broadcast', requireAuth, async (req, res, next) => {
  try {
    if (!websocket) {
      return res.status(503).json({ error: 'WebSocket not initialized' });
    }

    const { event, data } = req.body;

    if (!event) {
      return res.status(400).json({ error: 'Event name required' });
    }

    websocket.broadcast(event, data);

    res.json({
      success: true,
      message: `Broadcast sent to all clients`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/websocket/test/job
 * Test job progress notifications
 */
router.post('/test/job', requireAuth, async (req, res, next) => {
  try {
    if (!websocket) {
      return res.status(503).json({ error: 'WebSocket not initialized' });
    }

    const jobId = req.body.jobId || 'test-job-' + Date.now();

    // Simulate job progress
    websocket.jobProgress.emitStarted(jobId, { type: 'test' });

    setTimeout(() => {
      websocket.jobProgress.emitProgress(jobId, 30, { step: 'Processing...' });
    }, 1000);

    setTimeout(() => {
      websocket.jobProgress.emitProgress(jobId, 60, { step: 'Almost done...' });
    }, 2000);

    setTimeout(() => {
      websocket.jobProgress.emitCompleted(jobId, {
        message: 'Test job completed',
        result: 'success'
      });
    }, 3000);

    res.json({
      success: true,
      jobId,
      message: 'Test job progress will be emitted over 3 seconds'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/websocket/test/stream
 * Test LLM stream
 */
router.post('/test/stream', requireAuth, async (req, res, next) => {
  try {
    if (!websocket) {
      return res.status(503).json({ error: 'WebSocket not initialized' });
    }

    const streamId = req.body.streamId || 'test-stream-' + Date.now();
    const message = req.body.message || 'This is a test streaming message. Watch as it appears character by character!';

    // Start stream
    websocket.llmStream.emitStart(streamId, { test: true });

    // Stream message character by character
    let index = 0;
    const interval = setInterval(() => {
      if (index < message.length) {
        const chunk = message.slice(index, index + 5); // 5 characters at a time
        websocket.llmStream.emitToken(streamId, chunk);
        index += 5;
      } else {
        clearInterval(interval);
        websocket.llmStream.emitComplete(streamId, message, {
          test: true,
          totalLength: message.length
        });
      }
    }, 100);

    res.json({
      success: true,
      streamId,
      message: 'Test stream will emit over ~' + Math.ceil(message.length / 5) * 100 + 'ms'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/websocket/test/alert
 * Test alert notification
 */
router.post('/test/alert', requireAuth, async (req, res, next) => {
  try {
    if (!websocket) {
      return res.status(503).json({ error: 'WebSocket not initialized' });
    }

    const userId = req.user.id;

    websocket.alerts.emitUserAlert(userId, {
      type: 'info',
      title: 'Test Alert',
      message: 'This is a test alert notification',
      data: { timestamp: Date.now() }
    });

    res.json({
      success: true,
      message: 'Test alert sent to your WebSocket connection'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
