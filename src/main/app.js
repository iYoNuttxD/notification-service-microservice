const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

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
            imgSrc: ["'self'", 'data:', 'https:'],
            objectSrc: ["'none'"]
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

  // Raiz informativa
  app.get('/', (_req, res) => {
    res.status(200).json({
      service: 'Notification Service',
      version: '1.0.0',
      endpoints: {
        apiDocs: '/api-docs',
        health: '/api/v1/health',
        metrics: '/api/v1/metrics',
        notifications: '/api/v1/notifications',
        preferences: '/api/v1/preferences/:userId'
      }
    });
  });

  // Swagger UI / Fallback JSON
  const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');
  let spec = null;
  let specError = null;

  if (fs.existsSync(openapiPath)) {
    try {
      const raw = fs.readFileSync(openapiPath, 'utf8');
      spec = YAML.parse(raw);
      logger.info('OpenAPI spec loaded', { path: openapiPath });
    } catch (err) {
      specError = err;
      logger.warn('Failed to parse OpenAPI spec', { error: err.message, path: openapiPath });
    }
  } else {
    logger.warn('OpenAPI spec not found', { path: openapiPath });
  }

  if (spec && !specError) {
    // Monta UI sem redirect 301
    const uiHandler = (req, res, next) => {
      const handler = swaggerUi.setup(spec, {
        customSiteTitle: 'Notification Service API Docs',
        swaggerOptions: { docExpansion: 'none' }
      });
      handler(req, res, next);
    };
    app.get('/api-docs', uiHandler);
    app.get('/api-docs/', uiHandler);
    app.use('/api-docs/', swaggerUi.serve);
  } else {
    // JSON fallback (o teste espera application/json)
    const jsonFallback = (_req, res) => {
      res.status(200).json({
        status: 'unavailable',
        message: specError
          ? `OpenAPI spec parse failed: ${specError.message}`
          : 'OpenAPI spec not found. Add docs/openapi.yaml to enable Swagger UI.',
        expectedPath: openapiPath
      });
    };
    app.get('/api-docs', jsonFallback);
    app.get('/api-docs/', jsonFallback);
    app.get('/api-docs/openapi.yaml', jsonFallback);
    // Não monta swaggerUi.serve para evitar assets quebrados em fallback
  }

  // Feature routes
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
