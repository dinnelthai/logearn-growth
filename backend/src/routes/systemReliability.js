'use strict';

const express = require('express');
const { createUptimeKumaStatusClient } = require('../monitoring/uptimeKumaStatus');

const router = express.Router();
const client = createUptimeKumaStatusClient();

router.get('/overview', async (_req, res) => {
  try {
    res.json(await client.getOverview());
  } catch {
    res.status(503).json({ error: '系统可靠性数据暂不可用，请稍后重试。' });
  }
});

module.exports = router;
