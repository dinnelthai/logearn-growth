#!/usr/bin/env node
/**
 * WebSocket 功能测试
 *
 * 测试 WebSocket 实时推送功能
 */

require('dotenv').config();
const io = require('socket.io-client');

const WS_URL = process.env.WS_URL || 'http://localhost:3000';
const TOKEN = process.env.TEST_TOKEN || 'test-token-123';

console.log('🧪 WebSocket 测试开始\n');
console.log(`连接到: ${WS_URL}`);
console.log(`Token: ${TOKEN}\n`);

// Connect to WebSocket server
const socket = io(WS_URL, {
  auth: { token: TOKEN },
  transports: ['websocket', 'polling']
});

let testsPassed = 0;
let testsFailed = 0;

/**
 * Test 1: Connection
 */
socket.on('connect', () => {
  console.log('✅ Test 1: Connection successful');
  console.log(`   Socket ID: ${socket.id}\n`);
  testsPassed++;

  // Run tests after connection
  runTests();
});

socket.on('connect_error', (error) => {
  console.error('❌ Test 1: Connection failed');
  console.error(`   Error: ${error.message}\n`);
  testsFailed++;

  // If connection fails, exit
  setTimeout(() => {
    printSummary();
    process.exit(testsFailed > 0 ? 1 : 0);
  }, 1000);
});

socket.on('disconnect', (reason) => {
  console.log(`⚠️  Disconnected: ${reason}\n`);
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`🔄 Reconnected after ${attemptNumber} attempts\n`);
});

/**
 * Test 2: Ping/Pong
 */
function testPing() {
  return new Promise((resolve) => {
    console.log('🧪 Test 2: Ping/Pong');
    const startTime = Date.now();

    socket.emit('ping', (response) => {
      const latency = Date.now() - startTime;

      if (response && response.pong) {
        console.log(`✅ Pong received (${latency}ms)\n`);
        testsPassed++;
        resolve(true);
      } else {
        console.error('❌ Invalid pong response\n');
        testsFailed++;
        resolve(false);
      }
    });
  });
}

/**
 * Test 3: Job Progress Subscription
 */
function testJobProgress() {
  return new Promise((resolve) => {
    console.log('🧪 Test 3: Job Progress Subscription');

    const jobId = 'test-job-' + Date.now();
    let progressReceived = false;
    let completedReceived = false;

    // Subscribe to job
    socket.emit('subscribe:job', jobId);

    socket.on('subscribed', (data) => {
      if (data.type === 'job' && data.jobId === jobId) {
        console.log(`   Subscribed to job: ${jobId}`);
      }
    });

    // Listen for progress
    socket.on('job:progress', (data) => {
      if (data.jobId === jobId) {
        console.log(`   Progress: ${data.progress}% - ${data.step || ''}`);
        progressReceived = true;
      }
    });

    socket.on('job:completed', (data) => {
      if (data.jobId === jobId) {
        console.log(`   Job completed: ${JSON.stringify(data.result)}`);
        completedReceived = true;

        if (progressReceived && completedReceived) {
          console.log('✅ Job progress working\n');
          testsPassed++;
          resolve(true);
        }
      }
    });

    socket.on('job:failed', (data) => {
      if (data.jobId === jobId) {
        console.error(`❌ Job failed: ${data.error}\n`);
        testsFailed++;
        resolve(false);
      }
    });

    // Simulate job progress (call the test API)
    setTimeout(async () => {
      try {
        const fetch = (await import('node-fetch')).default;
        await fetch(`${WS_URL}/api/websocket/test/job`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`
          },
          body: JSON.stringify({ jobId })
        });
      } catch (error) {
        console.error(`   Failed to trigger test job: ${error.message}`);
      }
    }, 500);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!completedReceived) {
        console.error('❌ Job progress timeout\n');
        testsFailed++;
        resolve(false);
      }
    }, 5000);
  });
}

/**
 * Test 4: LLM Stream Subscription
 */
function testLLMStream() {
  return new Promise((resolve) => {
    console.log('🧪 Test 4: LLM Stream Subscription');

    const streamId = 'test-stream-' + Date.now();
    let tokensReceived = 0;
    let completeReceived = false;

    // Subscribe to stream
    socket.emit('subscribe:llm-stream', streamId);

    socket.on('llm:start', (data) => {
      if (data.streamId === streamId) {
        console.log(`   Stream started: ${streamId}`);
      }
    });

    socket.on('llm:token', (data) => {
      if (data.streamId === streamId) {
        process.stdout.write(data.token);
        tokensReceived++;
      }
    });

    socket.on('llm:complete', (data) => {
      if (data.streamId === streamId) {
        console.log(`\n   Stream completed (${tokensReceived} tokens received)`);
        completeReceived = true;

        if (tokensReceived > 0 && completeReceived) {
          console.log('✅ LLM stream working\n');
          testsPassed++;
          resolve(true);
        }
      }
    });

    socket.on('llm:error', (data) => {
      if (data.streamId === streamId) {
        console.error(`❌ Stream error: ${data.error}\n`);
        testsFailed++;
        resolve(false);
      }
    });

    // Trigger test stream
    setTimeout(async () => {
      try {
        const fetch = (await import('node-fetch')).default;
        await fetch(`${WS_URL}/api/websocket/test/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`
          },
          body: JSON.stringify({ streamId })
        });
      } catch (error) {
        console.error(`   Failed to trigger test stream: ${error.message}`);
      }
    }, 500);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!completeReceived) {
        console.error('❌ LLM stream timeout\n');
        testsFailed++;
        resolve(false);
      }
    }, 5000);
  });
}

/**
 * Test 5: Alerts
 */
function testAlerts() {
  return new Promise((resolve) => {
    console.log('🧪 Test 5: Alert Notifications');

    let alertReceived = false;

    // Subscribe to alerts
    socket.emit('subscribe:alerts');

    socket.on('alert', (data) => {
      console.log(`   Alert received: ${data.title} - ${data.message}`);
      alertReceived = true;
      console.log('✅ Alerts working\n');
      testsPassed++;
      resolve(true);
    });

    // Trigger test alert
    setTimeout(async () => {
      try {
        const fetch = (await import('node-fetch')).default;
        await fetch(`${WS_URL}/api/websocket/test/alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`
          }
        });
      } catch (error) {
        console.error(`   Failed to trigger test alert: ${error.message}`);
      }
    }, 500);

    // Timeout after 3 seconds
    setTimeout(() => {
      if (!alertReceived) {
        console.error('❌ Alert timeout\n');
        testsFailed++;
        resolve(false);
      }
    }, 3000);
  });
}

/**
 * Run all tests
 */
async function runTests() {
  try {
    await testPing();
    await testJobProgress();
    await testLLMStream();
    await testAlerts();
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Print summary and exit
    setTimeout(() => {
      socket.disconnect();
      printSummary();
      process.exit(testsFailed > 0 ? 1 : 0);
    }, 1000);
  }
}

/**
 * Print test summary
 */
function printSummary() {
  const total = testsPassed + testsFailed;
  console.log('═══════════════════════════════════════');
  console.log(`WebSocket 测试完成\n`);
  console.log(`总测试: ${total}`);
  console.log(`通过: ${testsPassed} ✅`);
  console.log(`失败: ${testsFailed} ❌`);
  console.log(`成功率: ${((testsPassed / total) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════\n');
}

// Handle process exit
process.on('SIGINT', () => {
  console.log('\nTest interrupted');
  socket.disconnect();
  process.exit(1);
});
