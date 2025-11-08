// src/main/app.js
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
  app.set('trust proxy', 1); 

  /**
   * Helmet
   * - Padrão para tudo
   * - CSP relaxado só para /api-docs (Swagger UI)
   */
  const helmetDefault = helmet();

  const helmetDocs = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:']
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
  // Rate limiting em /api/*
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP',

    // 🔑 Corrige o problema de IP inválido (IP:PORT)
    keyGenerator: (req) => {
      // 1. Se tiver X-Forwarded-For (Azure/proxy), usa o primeiro IP válido
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff.length > 0) {
        return xff.split(',')[0].trim();
      }

      // 2. Senão, usa req.ip/remoteAddress e remove porta se tiver
      const raw =
        req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        '';

      // se vier no formato "IP:PORT", pega só o IP
      const cleaned = raw.includes(':') && raw.includes('.')
        ? raw.split(':')[0] // IPv4:port
        : raw;

      return cleaned;
    },
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
   * - /api-docs e /api-docs/ SEM redirecionar 301
   * - HTML usa CDN do swagger-ui-dist (sem depender de /swagger-ui-bundle.js local)
   */
  const docsDir = path.resolve(__dirname, '../../docs');
  const openapiPath = path.join(docsDir, 'openapi.yaml');

  if (fs.existsSync(openapiPath)) {
    // Serve o YAML diretamente
    app.get('/api-docs/openapi.yaml', (_req, res) => {
      res.sendFile(openapiPath);
    });

    // HTML do Swagger UI (mesmo conteúdo para /api-docs e /api-docs/)
    const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Notification Service - API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api-docs/openapi.yaml',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`.trim();

    // /api-docs (sem slash) -> 200 com HTML (sem 301)
    app.get('/api-docs', (_req, res) => {
      res.status(200).send(swaggerHtml);
    });

    // /api-docs/ (com slash) -> 200 com o mesmo HTML
    app.get('/api-docs/', (_req, res) => {
      res.status(200).send(swaggerHtml);
    });

    logger.info('Swagger UI available at /api-docs');
  } else {
    logger.warn('OpenAPI documentation file not found', { path: openapiPath });

    const docsUnavailablePayload = {
      status: 'unavailable',
      message: 'OpenAPI spec not found. Add docs/openapi.yaml to enable Swagger UI.',
      expectedPath: openapiPath
    };

    app.get('/api-docs', (_req, res) => {
      res.status(200).json(docsUnavailablePayload);
    });

    app.get('/api-docs/', (_req, res) => {
      res.status(200).json(docsUnavailablePayload);
    });

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
