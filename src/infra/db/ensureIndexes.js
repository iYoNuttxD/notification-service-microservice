/**
 * Centralized index management for MongoDB collections
 * Ensures all required indexes are created at startup with idempotency
 */

async function ensureIndexes(mongoClient, dbName, logger) {
  const db = mongoClient.db(dbName);
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '90', 10);
  const dedupWindowSec = parseInt(process.env.NOTIF_DEDUP_WINDOW_SEC || '600', 10);

  logger.info('Ensuring database indexes...', { retentionDays, dedupWindowSec });

  const results = {
    notifications: false,
    attempts: false,
    inbox: false,
    templates: false,
    preferences: false
  };

  try {
    // Notifications collection
    const notifications = db.collection('notifications');
    await notifications.createIndex({ status: 1, createdAt: 1 });
    await notifications.createIndex({ 'recipient.userId': 1 });
    await notifications.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
    await notifications.createIndex({ 'metadata.orderId': 1 }, { sparse: true });
    await notifications.createIndex({ eventId: 1 });
    await notifications.createIndex({ nextAttemptAt: 1 }, { sparse: true });
    await notifications.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    );
    results.notifications = true;
    logger.info('Notifications indexes created');

    // Attempts collection
    const attempts = db.collection('attempts');
    await attempts.createIndex({ notificationId: 1 });
    await attempts.createIndex({ channel: 1, provider: 1 });
    await attempts.createIndex(
      { startedAt: 1 },
      { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    );
    results.attempts = true;
    logger.info('Attempts indexes created');

    // Inbox collection
    const inbox = db.collection('inbox');
    await inbox.createIndex({ eventId: 1 }, { unique: true });
    await inbox.createIndex(
      { processedAt: 1 },
      { expireAfterSeconds: dedupWindowSec }
    );
    results.inbox = true;
    logger.info('Inbox indexes created');

    // Templates collection
    const templates = db.collection('templates');
    await templates.createIndex({ key: 1, channel: 1, locale: 1 }, { unique: true });
    results.templates = true;
    logger.info('Templates indexes created');

    // Preferences collection
    const preferences = db.collection('preferences');
    await preferences.createIndex({ _id: 1 }); // userId is stored as _id
    await preferences.createIndex({ updatedAt: 1 });
    results.preferences = true;
    logger.info('Preferences indexes created');

    // Summary log for easier scanning
    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    logger.info(`SUMMARY: Database indexes ensured (${successCount}/${totalCount} collections)`, results);
  } catch (error) {
    logger.error('Failed to ensure indexes', { error: error.message, stack: error.stack });
    // Summary log even on partial failure
    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    logger.warn(`SUMMARY: Database indexes partially ensured (${successCount}/${totalCount} collections)`, results);
    // Don't throw - indexes may already exist or be in progress
  }
}

module.exports = { ensureIndexes };
