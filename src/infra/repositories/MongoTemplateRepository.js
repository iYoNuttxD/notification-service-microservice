class MongoTemplateRepository {
  constructor(mongoClient, dbName) {
    this.client = mongoClient;
    this.dbName = dbName;
    this.collection = null;
    this.cache = new Map();
  }

  async init() {
    const db = this.client.db(this.dbName);
    this.collection = db.collection('templates');
    // Removido: índice único criado via ensureIndexes().
  }

  async findByKey(templateKey, channel, locale = 'pt-BR') {
    const cacheKey = `${templateKey}:${channel}:${locale}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const doc = await this.collection.findOne({ templateKey, channel, locale });
    if (!doc) return null;

    const Template = require('../../domain/entities/Template');
    const template = Template.fromDocument(doc);
    this.cache.set(cacheKey, template);
    return template;
  }

  async save(template) {
    const doc = template.toDocument();
    const result = await this.collection.insertOne(doc);
    template.id = result.insertedId.toString();
    return template;
  }

  async seedDefaults() {
    // (mantém lógica de seeding)
  }
}

module.exports = MongoTemplateRepository;
