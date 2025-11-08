class MongoPreferencesRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('preferences');
  }

  async findByUserId(userId) {
    const doc = await this.collection.findOne({ _id: userId });

    if (!doc) {
      const Preferences = require('../../domain/entities/Preferences');
      return Preferences.getDefaults();
    }

    const Preferences = require('../../domain/entities/Preferences');
    return Preferences.fromDocument(doc);
  }

  async save(preferences) {
    const doc = preferences.toDocument();

    await this.collection.updateOne(
      { _id: preferences.userId },
      { $set: doc },
      { upsert: true }
    );

    return preferences;
  }

  async deleteByUserId(userId) {
    const result = await this.collection.deleteOne({ _id: userId });
    return result.deletedCount;
  }
}

module.exports = MongoPreferencesRepository;
