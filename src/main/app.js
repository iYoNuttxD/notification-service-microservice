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
      // Permissive CSP for Swagger UI (allows inline scripts and styles needed by Swagger)
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
      // Strict CSP for other routes
      helmet()(req, res, next);
    }
  });
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

  // Swagger documentation at /api-docs using robust path resolver
  const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');
  let openapiAvailable = false;

  try {
    if (fs.existsSync(openapiPath)) {
      const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
      app.use('/api-docs', swaggerUi.serve);
      app.get('/api-docs', swaggerUi.setup(openapiDoc));
      openapiAvailable = true;
      logger.info('Swagger UI available at /api-docs');
    } else {
      logger.warn('OpenAPI documentation file not found', { path: openapiPath });
    }
  } catch (error) {
    logger.warn('Failed to load OpenAPI documentation', { error: error.message });
  }

  // Fallback endpoint when OpenAPI spec is not available
  if (!openapiAvailable) {
    app.get('/api-docs', (req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message: 'OpenAPI spec not found',
        expectedPath: 'docs/openapi.yaml',
        suggestion: 'Add the OpenAPI specification file at the expected path to enable Swagger UI documentation.'
      });
    });
    logger.info('API docs fallback endpoint registered at /api-docs');
  }

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
