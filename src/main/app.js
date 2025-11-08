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

  // Helmet (CSP relaxado só para /api-docs)
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
  app.use((req, _res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    next();
  });

  // Raiz responde JSON (sem 404)
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

  // Swagger UI + Fallback (SEM parse do YAML no servidor)
  const docsDir = path.resolve(__dirname, '../../docs');
  const openapiPath = path.join(docsDir, 'openapi.yaml');

  if (fs.existsSync(openapiPath)) {
    // Servir o YAML diretamente
    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.sendFile(openapiPath);
    });

    // Handler explícito primeiro (garante 200 em /api-docs e /api-docs/)
    const swaggerHandler = (req, res, next) => {
      const handler = swaggerUi.setup(null, {
        swaggerOptions: { url: '/api-docs/openapi.yaml' }
      });
      handler(req, res, next);
    };
    app.get('/api-docs', swaggerHandler);
    app.get('/api-docs/', swaggerHandler);

    // Static assets do Swagger UI (DEPOIS dos GETs para evitar 301)
    app.use('/api-docs', swaggerUi.serve);

    logger.info('Swagger UI available at /api-docs');
  } else {
    logger.warn('OpenAPI documentation file not found', { path: openapiPath });

    // Fallback informativo (sem 404) em /api-docs e /api-docs/
    const docsFallback = (_req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message: 'OpenAPI spec not found. Add docs/openapi.yaml to enable Swagger UI.',
        expectedPath: openapiPath
      });
    };
    app.get('/api-docs', docsFallback);
    app.get('/api-docs/', docsFallback);

    // Fallback para a URL do YAML
    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message: 'OpenAPI spec not found at expected path.',
        expectedPath: openapiPath
      });
    });
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
