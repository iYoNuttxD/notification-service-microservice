class MongoInboxRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('inbox');
    // Removido: índices via ensureIndexes().
  }

  async isProcessed(eventId) {
    return (await this.collection.findOne({ eventId })) !== null;
  }

  async markProcessed(eventId) {
    await this.collection.insertOne({
      eventId,
      processedAt: new Date()
    });
  }

  async deleteByUserId(_userId) {
    // (Caso queira implementar limpeza por user, ajustar aqui)
    return 0;
  }
}

module.exports = MongoInboxRepository;
