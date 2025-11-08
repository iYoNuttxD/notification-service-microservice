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

  // Raiz informativa (sem 404)
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

  // Swagger UI
  const openapiPath = path.resolve(__dirname, '../../docs/openapi.yaml');
  let spec = null;

  if (fs.existsSync(openapiPath)) {
    try {
      spec = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
      logger.info('OpenAPI spec loaded', { path: openapiPath });
    } catch (err) {
      logger.warn('Failed to parse OpenAPI spec, using fallback UI', { error: err.message });
    }
  } else {
    logger.warn('OpenAPI spec not found, using fallback UI', { path: openapiPath });
  }

  if (spec) {
    // Handler explícito para devolver 200 em /api-docs e /api-docs/ sem 301
    const uiHandler = (req, res, next) => {
      const handler = swaggerUi.setup(spec, {
        customSiteTitle: 'Notification Service API Docs',
        swaggerOptions: { docExpansion: 'none' }
      });
      handler(req, res, next);
    };
    app.get('/api-docs', uiHandler);
    app.get('/api-docs/', uiHandler);

    // Assets do Swagger servidos em /api-docs/... (note a barra final no mount)
    app.use('/api-docs/', swaggerUi.serve);
  } else {
    // Fallback HTML simples (não referencia assets do Swagger)
    const fallbackHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Notification Service API Docs (Fallback)</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; }
  code { background: #f2f2f2; padding: 2px 4px; }
  .hint { margin-top: 20px; padding: 12px; background:#fff3cd; border:1px solid #ffeeba; }
</style>
</head>
<body>
  <h1>API Docs Indisponível</h1>
  <p>O arquivo <code>docs/openapi.yaml</code> não foi encontrado ou está inválido.</p>
  <div class="hint">
    <strong>Como habilitar:</strong>
    <ol>
      <li>Adicionar <code>docs/openapi.yaml</code> válido ao repositório.</li>
      <li>Garantir que o arquivo seja incluído no pacote de deploy.</li>
      <li>Reimplantar o serviço.</li>
    </ol>
  </div>
  <p>Esperado em: <code>${openapiPath}</code></p>
</body>
</html>`;
    const fallbackHandler = (_req, res) => res.status(200).send(fallbackHtml);
    app.get('/api-docs', fallbackHandler);
    app.get('/api-docs/', fallbackHandler);

    // Opcional: servir static para evitar 404 de assets caso alguém force o HTML antigo
    app.use('/api-docs/', swaggerUi.serve);
  }

  // Rotas de features
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
