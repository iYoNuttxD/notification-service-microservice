const { MongoClient } = require('mongodb');
const { createLogger } = require('../infra/utils/logger');
const MetricsCollector = require('../infra/utils/metrics');
const { parseBackoffSequence } = require('../infra/utils/backoff');

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

  // MongoDB connection
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  logger.info('Connected to MongoDB');

  const dbName = process.env.MONGODB_DB_NAME || 'notifications_db';

  // Initialize repositories
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

  // Seed templates if enabled
  if (process.env.SEED_TEMPLATES === 'true') {
    logger.info('Seeding default templates...');
    await templateRepository.seedDefaults();
  }

  // Initialize NATS
  const natsEventBus = new NatsEventBus({
    url: process.env.NATS_URL || 'nats://localhost:4222',
    queueGroup: process.env.NATS_QUEUE_GROUP || 'notification-service-workers'
  }, logger);
  await natsEventBus.connect();

  // Initialize channel senders
  const emailSender = new SendGridEmailSender({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'notifications@clickdelivery.com.br'
  }, logger, metrics);

  const smsSender = new TwilioSmsSender({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM
  }, logger, metrics);

  const pushSender = new FcmPushSender({
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY
  }, logger, metrics);

  const channelSenders = {
    email: emailSender,
    sms: smsSender,
    push: pushSender
  };

  // Initialize OPA client
  const opaClient = new OpaClient({
    url: process.env.OPA_URL,
    policyPath: process.env.OPA_POLICY_PATH || '/v1/data/notifications/allow',
    failOpen: process.env.OPA_FAIL_OPEN
  }, logger);

  // Initialize auth verifier
  const authVerifier = new JwtAuthVerifier({
    jwksUri: process.env.AUTH_JWKS_URI,
    issuer: process.env.AUTH_JWT_ISSUER,
    audience: process.env.AUTH_JWT_AUDIENCE,
    secret: process.env.AUTH_JWT_SECRET
  }, logger);

  // Parse backoff sequence
  const backoffSequence = parseBackoffSequence(process.env.NOTIF_BACKOFF_SEQUENCE);

  // Initialize use cases - Notifications
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

  // Initialize use cases - Preferences
  const getPreferencesUseCase = new GetPreferencesUseCase({
    preferencesRepository,
    logger
  });

  const updatePreferencesUseCase = new UpdatePreferencesUseCase({
    preferencesRepository,
    logger
  });

  // Initialize retry scheduler if JetStream is disabled
  let retryScheduler = null;
  const jetstreamEnabled = process.env.NATS_JETSTREAM_ENABLED === 'true';
  if (!jetstreamEnabled) {
    const schedulerIntervalMs = parseInt(process.env.RETRY_SCHEDULER_INTERVAL_MS || '30000', 10);
    retryScheduler = new RetryScheduler({
      notificationRepository,
      retryPendingUseCase,
      logger,
      intervalMs: schedulerIntervalMs
    });
    logger.info('RetryScheduler initialized (JetStream disabled)', { intervalMs: schedulerIntervalMs });
  }

  logger.info('Application container initialized successfully');

  return {
    logger,
    metrics,
    mongoClient,
    notificationRepository,
    attemptRepository,
    templateRepository,
    preferencesRepository,
    inboxRepository,
    natsEventBus,
    channelSenders,
    opaClient,
    authVerifier,
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

  if (retryScheduler) {
    retryScheduler.stop();
  }

  if (natsEventBus) {
    await natsEventBus.close();
  }

  if (mongoClient) {
    await mongoClient.close();
  }

  logger.info('Application container closed');
}

module.exports = {
  createContainer,
  closeContainer
};
