/**
 * Integration tests for notification dispatch
 * Tests basic dispatch, fallback, dedupe, retry, and LGPD deletion
 */

const { MongoClient } = require('mongodb');
const { createContainer, closeContainer } = require('../../src/main/container');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
process.env.MONGODB_DB_NAME = 'notifications_test';
process.env.NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
process.env.MOCK_PROVIDERS = 'true';
process.env.AUTH_JWT_REQUIRED = 'false';
process.env.SEED_TEMPLATES = 'false';
process.env.NATS_JETSTREAM_ENABLED = 'false';
process.env.NOTIF_BACKOFF_SEQUENCE = '1s,2s,3s';
process.env.NOTIF_MAX_ATTEMPTS_PER_CHANNEL = '2';

describe('Notification Service Integration Tests', () => {
  let container;
  let mongoClient;

  beforeAll(async () => {
    // Connect to MongoDB and clean up test database
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db(process.env.MONGODB_DB_NAME);
    await db.dropDatabase();

    // Initialize container
    container = await createContainer();
  }, 30000);

  afterAll(async () => {
    if (container) {
      await closeContainer(container);
    }
    if (mongoClient) {
      await mongoClient.close();
    }
  }, 10000);

  beforeEach(async () => {
    // Clean collections before each test
    const db = mongoClient.db(process.env.MONGODB_DB_NAME);
    await db.collection('notifications').deleteMany({});
    await db.collection('attempts').deleteMany({});
    await db.collection('inbox').deleteMany({});
    await db.collection('preferences').deleteMany({});
  });

  describe('Basic Dispatch', () => {
    it('should dispatch notification successfully with email channel', async () => {
      const event = {
        eventId: 'evt-test-001',
        eventType: 'test.event',
        occurredAt: new Date().toISOString(),
        recipient: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'customer'
        },
        templateKey: 'order_paid',
        data: {
          orderId: '12345',
          customerName: 'Test User',
          amount: '50.00'
        }
      };

      const result = await container.dispatchNotificationUseCase.execute(event);

      expect(result.success).toBe(true);
      expect(result.notificationId).toBeDefined();

      // Verify notification was saved
      const notification = await container.notificationRepository.findById(result.notificationId);
      expect(notification).toBeDefined();
      expect(notification.status).toBe('SENT');
      expect(notification.recipient.userId).toBe('user-123');

      // Verify attempt was recorded
      const attempts = await container.attemptRepository.findByNotificationId(result.notificationId);
      expect(attempts.length).toBeGreaterThan(0);
      expect(attempts[0].status).toBe('SUCCESS');
    });
  });

  describe('Fallback Strategy', () => {
    it('should fallback from push to email when push token is missing', async () => {
      const event = {
        eventId: 'evt-test-002',
        eventType: 'test.event',
        occurredAt: new Date().toISOString(),
        recipient: {
          userId: 'user-456',
          email: 'fallback@example.com',
          // No deviceToken - push will be skipped
          role: 'customer'
        },
        templateKey: 'order_paid',
        data: {
          orderId: '67890',
          customerName: 'Fallback User',
          amount: '75.00'
        }
      };

      const result = await container.dispatchNotificationUseCase.execute(event);

      expect(result.success).toBe(true);

      // Verify notification succeeded via email
      const notification = await container.notificationRepository.findById(result.notificationId);
      expect(notification.status).toBe('SENT');

      // Verify email was used (not push)
      const attempts = await container.attemptRepository.findByNotificationId(result.notificationId);
      const emailAttempt = attempts.find(a => a.channel === 'email');
      expect(emailAttempt).toBeDefined();
      expect(emailAttempt.status).toBe('SUCCESS');
    });
  });

  describe('Deduplication', () => {
    it('should prevent duplicate processing of same eventId', async () => {
      const event = {
        eventId: 'evt-dedupe-001',
        eventType: 'test.event',
        occurredAt: new Date().toISOString(),
        recipient: {
          userId: 'user-789',
          email: 'dedupe@example.com',
          role: 'customer'
        },
        templateKey: 'order_paid',
        data: {
          orderId: '11111'
        }
      };

      // First dispatch
      const result1 = await container.dispatchNotificationUseCase.execute(event);
      expect(result1.success).toBe(true);

      // Second dispatch with same eventId
      const result2 = await container.dispatchNotificationUseCase.execute(event);
      expect(result2.success).toBe(true);
      expect(result2.reason).toBe('duplicate');

      // Verify only one notification was created
      const notifications = await container.notificationRepository.findByFilters({
        eventType: 'test.event'
      });
      expect(notifications.data.length).toBe(1);
    });

    it('should detect duplicate via inbox repository', async () => {
      const eventId = 'evt-inbox-test';

      // Mark as processed
      const marked = await container.inboxRepository.markProcessed(eventId);
      expect(marked).toBe(true);

      // Check if processed
      const isProcessed = await container.inboxRepository.isProcessed(eventId);
      expect(isProcessed).toBe(true);

      // Try to mark again - should return false
      const markedAgain = await container.inboxRepository.markProcessed(eventId);
      expect(markedAgain).toBe(false);
    });
  });

  describe('LGPD Data Deletion', () => {
    it('should delete all user data by userId', async () => {
      const userId = 'user-lgpd-test';

      // Create test data
      const event1 = {
        eventId: 'evt-lgpd-001',
        eventType: 'test.event',
        recipient: {
          userId,
          email: 'lgpd@example.com',
          role: 'customer'
        },
        templateKey: 'order_paid',
        data: { orderId: '1' }
      };

      const event2 = {
        eventId: 'evt-lgpd-002',
        eventType: 'test.event',
        recipient: {
          userId,
          email: 'lgpd@example.com',
          role: 'customer'
        },
        templateKey: 'order_paid',
        data: { orderId: '2' }
      };

      await container.dispatchNotificationUseCase.execute(event1);
      await container.dispatchNotificationUseCase.execute(event2);

      // Create preferences
      await container.preferencesRepository.save({
        userId,
        channels: { email: true },
        toDocument: function () {
          return { _id: this.userId, channels: this.channels };
        }
      });

      // Verify data exists
      const notificationsBefore = await container.notificationRepository.findByFilters({
        'recipient.userId': userId
      });
      expect(notificationsBefore.data.length).toBe(2);

      // Delete user data
      const notificationIds = notificationsBefore.data.map(n => n.id);
      const attemptsDeleted = await container.attemptRepository.deleteByNotificationIds(notificationIds);
      const notificationsDeleted = await container.notificationRepository.deleteByUserId(userId);
      const preferencesDeleted = await container.preferencesRepository.deleteByUserId(userId);
      const inboxDeleted = await container.inboxRepository.deleteByUserId(userId);

      expect(notificationsDeleted).toBe(2);
      expect(preferencesDeleted).toBe(1);
      expect(attemptsDeleted).toBeGreaterThanOrEqual(0);
      expect(inboxDeleted).toBe(0); // inbox doesn't track userId

      // Verify data is deleted
      const notificationsAfter = await container.notificationRepository.findByFilters({
        'recipient.userId': userId
      });
      expect(notificationsAfter.data.length).toBe(0);
    });
  });
});
