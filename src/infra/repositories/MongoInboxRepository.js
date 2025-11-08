class MongoInboxRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('inbox');

    // Create unique index on eventId
    await this.collection.createIndex({ eventId: 1 }, { unique: true });

    // TTL index for dedup window
    const dedupWindowSec = parseInt(process.env.NOTIF_DEDUP_WINDOW_SEC || '600', 10);
    await this.collection.createIndex(
      { processedAt: 1 },
      { expireAfterSeconds: dedupWindowSec }
    );
  }

  async isProcessed(eventId) {
    const doc = await this.collection.findOne({ eventId });
    return doc !== null;
  }

  async markProcessed(eventId) {
    try {
      await this.collection.insertOne({
        eventId,
        processedAt: new Date()
      });
      return true;
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error - already processed
        return false;
      }
      throw error;
    }
  }

  async deleteByUserId(_userId) {
    // Note: inbox doesn't store userId directly, so this is a no-op
    // but provided for consistency with LGPD requirements
    // In the future, if inbox tracks userId, implement deletion here
    return 0;
  }
}

module.exports = MongoInboxRepository;
