const { MongoClient } = require('mongodb');
const { createLogger } = require('../infra/utils/logger');
const MetricsCollector = require('../infra/utils/metrics');
const { parseBackoffSequence } = require('../infra/utils/backoff');
const { ensureIndexes } = require('../infra/db/ensureIndexes');

// Repositories
const {
  MongoNotificationRepository,
  MongoAttemptRepository,
  MongoTemplateRepository,
  MongoPreferencesRepository,
  MongoInboxRepository
} = require('../infra/repositories');

// Adapters
const NatsEventBus = require('../infra/adapters/nats/NatsEventBus');
const SendGridEmailSender = require('../infra/adapters/email/SendGridEmailSender');
const TwilioSmsSender = require('../infra/adapters/sms/TwilioSmsSender');
const FcmPushSender = require('../infra/adapters/push/FcmPushSender');
const OpaClient = require('../infra/adapters/opa/OpaClient');
const JwtAuthVerifier = require('../infra/adapters/auth/JwtAuthVerifier');

// Use cases - Notifications
const DispatchNotificationUseCase = require('../features/notifications/use-cases/DispatchNotificationUseCase');
const RetryPendingUseCase = require('../features/notifications/use-cases/RetryPendingUseCase');
const RenderTemplateUseCase = require('../features/notifications/use-cases/RenderTemplateUseCase');
const PublishStatusUseCase = require('../features/notifications/use-cases/PublishStatusUseCase');

// Use cases - Preferences
const GetPreferencesUseCase = require('../features/preferences/use-cases/GetPreferencesUseCase');
const UpdatePreferencesUseCase = require('../features/preferences/use-cases/UpdatePreferencesUseCase');

// Scheduler
const RetryScheduler = require('../infra/scheduler/RetryScheduler');

async function createContainer() {
  const logger = createLogger();
  const metrics = new MetricsCollector();

  logger.info('Initializing application container...');

  // 1) MongoDB
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  logger.info('Connected to MongoDB');

  const dbName = process.env.MONGODB_DB_NAME || 'notifications_db';

  // Ensure all indexes
  await ensureIndexes(mongoClient, dbName, logger);

  // 2) Repositories (no index creation here)
  const notificationRepository = new MongoNotificationRepository(mongoClient, dbName);
  await notificationRepository.init();

  const attemptRepository = new MongoAttemptRepository(mongoClient, dbName);
  await attemptRepository.init();

  const templateRepository = new MongoTemplateRepository(mongoClient, dbName);
  await templateRepository.init();

  const preferencesRepository = new MongoPreferencesRepository(mongoClient, dbName);
  await preferencesRepository.init();

  const inboxRepository = new MongoInboxRepository(mongoClient, dbName);
  await inboxRepository.init();

  // Seed templates (best-effort)
  if (process.env.SEED_TEMPLATES === 'true') {
    try {
      logger.info('Seeding default templates...');
      const seedResult = await templateRepository.seedDefaults();
      logger.info('Template seeding completed', seedResult);
    } catch (err) {
      logger.warn('Template seeding failed (continuing startup)', { error: err.message });
    }
  }

  // 3) NATS (best-effort)
  let natsEventBus = null;
  try {
    natsEventBus = new NatsEventBus({
      url: process.env.NATS_URL || 'nats://localhost:4222',
      queueGroup: process.env.NATS_QUEUE_GROUP || 'notification-service-workers'
    }, logger);
    await natsEventBus.connect();
    logger.info('Connected to NATS', { server: process.env.NATS_URL || 'nats://localhost:4222' });
  } catch (err) {
    logger.error('Failed to connect to NATS (continuing without NATS)', { error: err.message });
  }

  // 4) Channel senders (conditional)
  const channelSenders = {};

  // Email (SMTP)
  const haveSmtpCreds = !!(process.env.SMTP_HOST && process.env.EMAIL_FROM);
  if (haveSmtpCreds) {
    try {
      channelSenders.email = new SendGridEmailSender({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.EMAIL_FROM || 'notifications@clickdelivery.com.br'
      }, logger, metrics);
      logger.info('Email sender initialized (SMTP)');
    } catch (err) {
      logger.warn('Failed to initialize Email sender - disabling email channel', { error: err.message });
    }
  } else {
    logger.info('SMTP credentials not provided - Email channel disabled');
  }

  // SMS (Twilio) or mock
  const mockProviders = process.env.MOCK_PROVIDERS === 'true';
  const haveTwilioCreds = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  if (mockProviders || haveTwilioCreds) {
    try {
      channelSenders.sms = new TwilioSmsSender({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        from: process.env.TWILIO_FROM
      }, logger, metrics);
      logger.info(mockProviders ? 'SMS sender in MOCK mode' : 'Twilio SMS sender initialized');
    } catch (err) {
      logger.warn('Failed to initialize SMS sender - disabling SMS channel', { error: err.message });
    }
  } else {
    logger.info('Twilio credentials not provided - SMS channel disabled');
  }

  // Push (FCM)
  const haveFcmCreds = !!(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
  if (haveFcmCreds) {
    try {
      channelSenders.push = new FcmPushSender({
        projectId: process.env.FCM_PROJECT_ID,
        clientEmail: process.env.FCM_CLIENT_EMAIL,
        privateKey: process.env.FCM_PRIVATE_KEY
      }, logger, metrics);
      logger.info('FCM push sender initialized');
    } catch (err) {
      logger.warn('Failed to initialize FCM sender - disabling Push channel', { error: err.message });
    }
  } else {
    logger.info('FCM credentials not provided - Push channel disabled');
  }

  // 5) OPA client
  const opaClient = new OpaClient({
    url: process.env.OPA_URL,
    policyPath: process.env.OPA_POLICY_PATH || '/v1/data/notifications/allow',
    failOpen: (process.env.OPA_FAIL_OPEN || 'true') === 'true'
  }, logger);

  // 6) Auth verifier
  const authVerifier = new JwtAuthVerifier({
    jwksUri: process.env.AUTH_JWKS_URI,
    issuer: process.env.AUTH_JWT_ISSUER,
    audience: process.env.AUTH_JWT_AUDIENCE,
    secret: process.env.AUTH_JWT_SECRET
  }, logger);

  // 7) Backoff
  const backoffSequence = parseBackoffSequence(process.env.NOTIF_BACKOFF_SEQUENCE);

  // 8) Use cases - Notifications
  const dispatchNotificationUseCase = new DispatchNotificationUseCase({
    notificationRepository,
    attemptRepository,
    templateRepository,
    preferencesRepository,
    inboxRepository,
    channelSenders,
    eventPublisher: natsEventBus,
    logger,
    metrics,
    backoffSequence
  });

  const retryPendingUseCase = new RetryPendingUseCase({
    notificationRepository,
    attemptRepository,
    templateRepository,
    channelSenders,
    eventPublisher: natsEventBus,
    logger,
    metrics,
    backoffSequence
  });

  const renderTemplateUseCase = new RenderTemplateUseCase({
    templateRepository,
    logger
  });

  const publishStatusUseCase = new PublishStatusUseCase({
    eventPublisher: natsEventBus,
    logger
  });

  // 9) Use cases - Preferences
  const getPreferencesUseCase = new GetPreferencesUseCase({
    preferencesRepository,
    logger
  });

  const updatePreferencesUseCase = new UpdatePreferencesUseCase({
    preferencesRepository,
    logger
  });

  // 10) Retry scheduler (when JetStream disabled)
  let retryScheduler = null;
  const jetstreamEnabled = process.env.NATS_JETSTREAM_ENABLED === 'true';
  if (!jetstreamEnabled) {
    try {
      const schedulerIntervalMs = parseInt(process.env.RETRY_SCHEDULER_INTERVAL_MS || '30000', 10);
      retryScheduler = new RetryScheduler({
        notificationRepository,
        retryPendingUseCase,
        logger,
        intervalMs: schedulerIntervalMs
      });
      logger.info('RetryScheduler initialized (JetStream disabled)', { intervalMs: schedulerIntervalMs });
    } catch (err) {
      logger.warn('Failed to initialize RetryScheduler (continuing without it)', { error: err.message });
    }
  }

  logger.info('Application container initialized successfully');

  return {
    logger,
    metrics,
    mongoClient,
    natsEventBus,
    opaClient,
    authVerifier,
    notificationRepository,
    attemptRepository,
    templateRepository,
    preferencesRepository,
    inboxRepository,
    channelSenders,
    dispatchNotificationUseCase,
    retryPendingUseCase,
    renderTemplateUseCase,
    publishStatusUseCase,
    getPreferencesUseCase,
    updatePreferencesUseCase,
    retryScheduler,
    backoffSequence
  };
}

async function closeContainer(container) {
  const { logger, mongoClient, natsEventBus, retryScheduler } = container;

  logger.info('Closing application container...');

  try {
    if (retryScheduler) retryScheduler.stop();
  } catch (err) {
    logger.warn('Error stopping RetryScheduler', { error: err.message });
  }

  try {
    if (natsEventBus) await natsEventBus.close();
  } catch (err) {
    logger.warn('Error closing NATS', { error: err.message });
  }

  try {
    if (mongoClient) await mongoClient.close();
  } catch (err) {
    logger.warn('Error closing MongoDB', { error: err.message });
  }

  logger.info('Application container closed');
}

module.exports = {
  createContainer,
  closeContainer
};
