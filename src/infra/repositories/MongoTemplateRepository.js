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
    // Index creation centralized in ensureIndexes()
  }

  async findByKey(templateKey, channel, locale = 'pt-BR') {
    const cacheKey = `${templateKey}:${channel}:${locale}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const doc = await this.collection.findOne({ templateKey, channel, locale });
    if (!doc) return null;

    const Template = require('../../domain/entities/Template');
    const template = Template.fromDocument(doc);
    this.cache.set(cacheKey, template);

    return template;
  }

  async save(template) {
    const doc = template.toDocument();

    await this.collection.updateOne(
      { templateKey: doc.templateKey, channel: doc.channel, locale: doc.locale },
      { $set: doc },
      { upsert: true }
    );

    // Invalidate cache
    const cacheKey = `${template.templateKey}:${template.channel}:${template.locale}`;
    this.cache.delete(cacheKey);

    return template;
  }

  async seedDefaults() {
    const Template = require('../../domain/entities/Template');

    const defaultTemplates = [
      // Email templates
      new Template({
        templateKey: 'order_paid',
        channel: 'email',
        locale: 'pt-BR',
        subject: 'Pedido confirmado - #{{orderId}}',
        body: 'Olá {{customerName}},\n\nSeu pedido #{{orderId}} foi confirmado e está sendo preparado!\n\nValor: R$ {{amount}}\nRestaurante: {{restaurantName}}\n\nObrigado por escolher Click Delivery!'
      }),
      new Template({
        templateKey: 'delivery_assigned',
        channel: 'email',
        locale: 'pt-BR',
        subject: 'Nova entrega disponível - #{{deliveryId}}',
        body: 'Olá {{delivererName}},\n\nVocê tem uma nova entrega!\n\nEntrega #{{deliveryId}}\nEndereço: {{address}}\nDistância: {{distance}} km\n\nBoa entrega!'
      }),
      new Template({
        templateKey: 'rental_started',
        channel: 'email',
        locale: 'pt-BR',
        subject: 'Locação iniciada - {{vehicleModel}}',
        body: 'Olá {{renterName}},\n\nSua locação do veículo {{vehicleModel}} foi iniciada!\n\nPeríodo: {{startDate}} até {{endDate}}\nValor diário: R$ {{dailyRate}}\n\nBom trabalho!'
      }),
      // SMS templates
      new Template({
        templateKey: 'order_paid',
        channel: 'sms',
        locale: 'pt-BR',
        body: 'Click Delivery: Pedido #{{orderId}} confirmado! Valor: R$ {{amount}}. Seu pedido está sendo preparado.'
      }),
      new Template({
        templateKey: 'delivery_assigned',
        channel: 'sms',
        locale: 'pt-BR',
        body: 'Click Delivery: Nova entrega #{{deliveryId}}! Endereço: {{address}}. Distância: {{distance}} km.'
      }),
      new Template({
        templateKey: 'rental_started',
        channel: 'sms',
        locale: 'pt-BR',
        body: 'Click Delivery: Locação de {{vehicleModel}} iniciada! Período: {{startDate}} a {{endDate}}.'
      }),
      // Push templates
      new Template({
        templateKey: 'order_paid',
        channel: 'push',
        locale: 'pt-BR',
        subject: 'Pedido confirmado!',
        body: 'Seu pedido #{{orderId}} foi confirmado e está sendo preparado. Valor: R$ {{amount}}'
      }),
      new Template({
        templateKey: 'delivery_assigned',
        channel: 'push',
        locale: 'pt-BR',
        subject: 'Nova entrega!',
        body: 'Você tem uma nova entrega #{{deliveryId}}. Distância: {{distance}} km'
      }),
      new Template({
        templateKey: 'rental_started',
        channel: 'push',
        locale: 'pt-BR',
        subject: 'Locação iniciada!',
        body: 'Sua locação do {{vehicleModel}} foi iniciada com sucesso!'
      })
    ];

    let inserted = 0;
    let skipped = 0;

    for (const template of defaultTemplates) {
      const existing = await this.findByKey(template.templateKey, template.channel, template.locale);
      if (existing) {
        skipped++;
        continue;
      }

      await this.save(template);
      inserted++;
    }

    return { inserted, skipped, total: defaultTemplates.length };
  }
}

module.exports = MongoTemplateRepository;
