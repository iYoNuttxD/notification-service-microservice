const express = require('express');

function createSystemRoutes(container) {
  const router = express.Router();
  const { logger, metrics } = container;

  // Health check (no auth required)
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Metrics endpoint (internal only)
  router.get('/metrics', async (req, res) => {
    try {
      const metricsData = await metrics.getMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metricsData);
    } catch (error) {
      logger.error('Failed to get metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  return router;
}

module.exports = createSystemRoutes;
