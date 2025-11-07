const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

function createApp(container) {
  const app = express();
  const logger = container.logger;

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
  });
  app.use('/api/', limiter);

  // Request logging
  app.use((req, res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    next();
  });

  // Health check (no auth required)
  app.get('/api/v1/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Metrics endpoint (internal only)
  app.get('/api/v1/metrics', async (req, res) => {
    try {
      const metrics = await container.metrics.getMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      logger.error('Failed to get metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  // Mount feature routes
  const notificationRoutes = require('../features/notifications/http/routes');
  const preferencesRoutes = require('../features/preferences/http/routes');

  app.use('/api/v1', notificationRoutes(container));
  app.use('/api/v1', preferencesRoutes(container));

  // Swagger documentation
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yaml');
  const fs = require('fs');
  const path = require('path');

  try {
    const openapiPath = path.join(__dirname, '../../docs/openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
    }
  } catch (error) {
    logger.warn('Failed to load OpenAPI documentation', { error: error.message });
  }

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path
    });

    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  });

  return app;
}

module.exports = createApp;
