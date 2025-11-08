const { MongoClient } = require('mongodb');

class MongoNotificationRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('notifications');
    // Removido: criação de índices duplicada.
    // Todos os índices (incluindo TTL) já são garantidos por ensureIndexes() no container.
  }

  async save(notification) {
    const doc = notification.toDocument();
    const result = await this.collection.insertOne(doc);
    notification.id = result.insertedId.toString();
    return notification;
  }

  async findById(id) {
    const { ObjectId } = require('mongodb');
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;

    const Notification = require('../../domain/entities/Notification');
    return Notification.fromDocument(doc);
  }

  async findByEventId(eventId) {
    const doc = await this.collection.findOne({ eventId });
    if (!doc) return null;

    const Notification = require('../../domain/entities/Notification');
    return Notification.fromDocument(doc);
  }

  async findPendingRetries() {
    const now = new Date();
    const docs = await this.collection
      .find({
        status: { $in: ['RETRY', 'QUEUED'] },
        $or: [
          { nextAttemptAt: { $lte: now } },
          { nextAttemptAt: null }
        ]
      })
      .limit(100)
      .toArray();

    const Notification = require('../../domain/entities/Notification');
    return docs.map(doc => Notification.fromDocument(doc));
  }

  async findByFilters(filters) {
    const query = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters['recipient.userId']) {
      query['recipient.userId'] = filters['recipient.userId'];
    }

    if (filters.eventType) {
      query.eventType = filters.eventType;
    }

    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = new Date(filters.from);
      if (filters.to) query.createdAt.$lte = new Date(filters.to);
    }

    const page = parseInt(filters.page || '1', 10);
    const limit = parseInt(filters.limit || '50', 10);
    const skip = (page - 1) * limit;

    const docs = await this.collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await this.collection.countDocuments(query);

    const Notification = require('../../domain/entities/Notification');
    return {
      data: docs.map(doc => Notification.fromDocument(doc)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async update(notification) {
    const { ObjectId } = require('mongodb');
    const doc = notification.toDocument();
    delete doc._id;

    await this.collection.updateOne(
      { _id: new ObjectId(notification.id) },
      { $set: doc }
    );

    return notification;
  }

  async deleteByUserId(userId) {
    const result = await this.collection.deleteMany({ 'recipient.userId': userId });
    return result.deletedCount;
  }
}

module.exports = MongoNotificationRepository;
