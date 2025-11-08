const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');

function createApp(container) {
  const app = express();
  const logger = container.logger;

  /**
   * Helmet
   * - CSP padrão
   * - CSP relaxado só para /api-docs (Swagger UI)
   */
  const helmetDefault = helmet();
  const helmetDocs = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api-docs')) {
      return helmetDocs(req, res, next);
    }
    return helmetDefault(req, res, next);
  });

  /**
   * CORS + Body parsing
   */
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  /**
   * Rate limiting em /api/*
   */
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP'
  });
  app.use('/api/', limiter);

  /**
   * Request logging
   */
  app.use((req, _res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    next();
  });

  /**
   * Raiz responde JSON
   */
  app.get('/', (_req, res) => {
    res.status(200).json({
      service: 'Notification Service',
      version: '1.0.0',
      endpoints: {
        health: '/api/v1/health',
        metrics: '/api/v1/metrics',
        apiDocs: '/api-docs',
        notifications: '/api/v1/notifications',
        preferences: '/api/v1/preferences/:userId'
      }
    });
  });

  /**
   * Swagger UI / OpenAPI
   * - openapi.yaml em /docs/openapi.yaml
   * - /api-docs -> 200 (HTML Swagger UI)
   * - assets servidos em /api-docs/*
   */
  const docsDir = path.resolve(__dirname, '../../docs');
  const openapiPath = path.join(docsDir, 'openapi.yaml');

  if (fs.existsSync(openapiPath)) {
    // Serve o YAML da especificação
    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.sendFile(openapiPath);
    });

    // Serve assets do Swagger UI em /api-docs/* sem redirect 301
    app.use(
      '/api-docs',
      swaggerUi.serveWithOptions({ redirect: false })
    );

    // Handler HTML do Swagger UI em /api-docs e /api-docs/
    const swaggerHandler = swaggerUi.setup(null, {
      swaggerOptions: {
        url: '/api-docs/openapi.yaml'
      }
    });

    app.get('/api-docs', swaggerHandler);
    app.get('/api-docs/', swaggerHandler);

    logger.info('Swagger UI available at /api-docs');
  } else {
    logger.warn('OpenAPI documentation file not found', { path: openapiPath });

    const docsFallback = (_req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message:
          'OpenAPI spec not found. Add docs/openapi.yaml to enable Swagger UI.',
        expectedPath: openapiPath
      });
    };

    app.get('/api-docs', docsFallback);
    app.get('/api-docs/', docsFallback);

    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message: 'OpenAPI spec not found at expected path.',
        expectedPath: openapiPath
      });
    });
  }

  /**
   * Feature routes
   */
  const systemRoutes = require('../features/system/http/routes');
  const notificationRoutes = require('../features/notifications/http/routes');
  const preferencesRoutes = require('../features/preferences/http/routes');

  app.use('/api/v1', systemRoutes(container));
  app.use('/api/v1', notificationRoutes(container));
  app.use('/api/v1', preferencesRoutes(container));

  /**
   * 404 handler
   */
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path
    });
  });

  /**
   * Error handler
   */
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
