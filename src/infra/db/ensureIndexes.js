/**
 * Centralized index management for MongoDB collections
 * Ensures all required indexes are created at startup with idempotency
 */
async function ensureIndexes(mongoClient, dbName, logger) {
  const db = mongoClient.db(dbName);
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '90', 10);
  const dedupWindowSec = parseInt(process.env.NOTIF_DEDUP_WINDOW_SEC || '600', 10);

  const conflicts = [];
  let okCount = 0;

  logger.info('Ensuring database indexes...', { retentionDays, dedupWindowSec });

  const safeCreate = async (collection, spec, options = undefined) => {
    try {
      await collection.createIndex(spec, options);
      okCount++;
    } catch (error) {
      if (error && error.code === 85) {
        // IndexOptionsConflict (existing index with different name/options)
        conflicts.push({
          collection: collection.collectionName,
          spec,
          options,
          message: error.message
        });
        logger.warn('Index conflict (already exists with a different name/options)', {
          collection: collection.collectionName,
          spec,
          options,
          error: error.message
        });
      } else {
        logger.error('Failed to create index', {
          collection: collection.collectionName,
          spec,
          options,
          error: error.message,
          stack: error.stack
        });
      }
    }
  };

  try {
    // Notifications
    const notifications = db.collection('notifications');
    await safeCreate(notifications, { status: 1, createdAt: 1 });
    await safeCreate(notifications, { 'recipient.userId': 1 });
    await safeCreate(notifications, { idempotencyKey: 1 }, { unique: true, sparse: true });
    await safeCreate(notifications, { 'metadata.orderId': 1 }, { sparse: true });
    await safeCreate(notifications, { eventId: 1 });
    await safeCreate(notifications, { nextAttemptAt: 1 }, { sparse: true });
    await safeCreate(
      notifications,
      { createdAt: 1 },
      { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    );
    logger.info('Notifications indexes created');

    // Attempts
    const attempts = db.collection('attempts');
    await safeCreate(attempts, { notificationId: 1 });
    await safeCreate(attempts, { channel: 1, provider: 1 });
    await safeCreate(
      attempts,
      { startedAt: 1 },
      { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    );
    logger.info('Attempts indexes created');

    // Inbox (idempotency)
    const inbox = db.collection('inbox');
    await safeCreate(inbox, { eventId: 1 }, { unique: true });
    await safeCreate(
      inbox,
      { processedAt: 1 },
      { expireAfterSeconds: dedupWindowSec }
    );
    logger.info('Inbox indexes created');

    // Templates (use correct field: templateKey)
    const templates = db.collection('templates');
    await safeCreate(templates, { templateKey: 1, channel: 1, locale: 1 }, { unique: true });
    logger.info('Templates indexes created');

    // Preferences
    const preferences = db.collection('preferences');
    await safeCreate(preferences, { _id: 1 });
    await safeCreate(preferences, { updatedAt: 1 });
    logger.info('Preferences indexes created');

    const status = conflicts.length > 0 ? 'partial' : 'ok';
    logger.info('Indexes ensure summary', {
      status,
      okCount,
      conflictCount: conflicts.length,
      conflicts
    });
  } catch (error) {
    logger.error('Failed to ensure indexes', { error: error.message, stack: error.stack });
  }
}

module.exports = { ensureIndexes };
