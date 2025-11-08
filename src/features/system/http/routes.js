const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

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

  // Swagger documentation
  try {
    const openapiPath = path.join(__dirname, '../../../docs/openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
      router.use('/api-docs', swaggerUi.serve);
      router.get('/api-docs', swaggerUi.setup(openapiDoc));
    } else {
      logger.warn('OpenAPI documentation file not found');
    }
  } catch (error) {
    logger.warn('Failed to load OpenAPI documentation', { error: error.message });
  }

  return router;
}

module.exports = createSystemRoutes;
