const { MongoClient } = require('mongodb');

class MongoAttemptRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('attempts');

    // Create indexes
    await this.collection.createIndex({ notificationId: 1 });
    await this.collection.createIndex({ channel: 1, provider: 1 });

    // TTL index
    const retentionDays = parseInt(process.env.RETENTION_DAYS || '90', 10);
    await this.collection.createIndex(
      { startedAt: 1 },
      { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
    );
  }

  async save(attempt) {
    const doc = attempt.toDocument();
    const result = await this.collection.insertOne(doc);
    attempt.id = result.insertedId.toString();
    return attempt;
  }

  async findByNotificationId(notificationId) {
    const docs = await this.collection
      .find({ notificationId })
      .sort({ startedAt: -1 })
      .toArray();

    const Attempt = require('../../domain/entities/Attempt');
    return docs.map(doc => Attempt.fromDocument(doc));
  }

  async deleteByNotificationIds(notificationIds) {
    if (!notificationIds || notificationIds.length === 0) {
      return 0;
    }
    const result = await this.collection.deleteMany({
      notificationId: { $in: notificationIds }
    });
    return result.deletedCount;
  }
}

module.exports = MongoAttemptRepository;
