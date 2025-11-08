class MongoInboxRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('inbox');
    // Index creation centralized in ensureIndexes()
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
    // No-op for now (userId isn't stored in inbox)
    return 0;
  }
}

module.exports = MongoInboxRepository;
