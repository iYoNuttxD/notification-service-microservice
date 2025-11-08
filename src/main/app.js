const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

function createApp(container) {
  const app = express();
  const logger = container.logger;

  // Configure Helmet with relaxed CSP for Swagger UI
  app.use((req, res, next) => {
    if (req.path.startsWith('/api-docs')) {
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:']
          }
        }
      })(req, res, next);
    } else {
      helmet()(req, res, next);
    }
  });
  app.use(cors());

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
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

  // Swagger documentation at /api-docs with fallback
  try {
    const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
      app.use('/api-docs', swaggerUi.serve);
      app.get('/api-docs', swaggerUi.setup(openapiDoc));
      logger.info('Swagger UI available at /api-docs');
    } else {
      logger.warn('OpenAPI documentation file not found', { path: openapiPath });
      app.get('/api-docs', (_req, res) => {
        res.status(200).json({
          status: 'unavailable',
          message: 'OpenAPI spec not found. Add docs/openapi.yaml to enable Swagger UI.',
          expectedPath: path.resolve(__dirname, '../../docs/openapi.yaml')
        });
      });
    }
  } catch (error) {
    logger.warn('Failed to load OpenAPI documentation', { error: error.message });
    app.get('/api-docs', (_req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message: 'Failed to load OpenAPI spec due to an error.',
        error: error.message
      });
    });
  }

  // Redirect root to /api-docs to avoid 404 confusion
  app.get('/', (_req, res) => {
    res.redirect(302, '/api-docs');
  });

  // Mount feature routes
  const systemRoutes = require('../features/system/http/routes');
  const notificationRoutes = require('../features/notifications/http/routes');
  const preferencesRoutes = require('../features/preferences/http/routes');

  app.use('/api/v1', systemRoutes(container));
  app.use('/api/v1', notificationRoutes(container));
  app.use('/api/v1', preferencesRoutes(container));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path
    });
  });

  // Error handler
  app.use((err, req, res, _next) => {
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
