class Template {
  constructor({
    id,
    templateKey,
    channel,
    locale = 'pt-BR',
    version = 1,
    subject = null,
    body,
    updatedAt = new Date()
  }) {
    this.id = id;
    this.templateKey = templateKey;
    this.channel = channel;
    this.locale = locale;
    this.version = version;
    this.subject = subject;
    this.body = body;
    this.updatedAt = updatedAt;
  }

  static fromDocument(doc) {
    return new Template({
      id: doc._id?.toString(),
      templateKey: doc.templateKey,
      channel: doc.channel,
      locale: doc.locale,
      version: doc.version,
      subject: doc.subject,
      body: doc.body,
      updatedAt: doc.updatedAt
    });
  }

  toDocument() {
    return {
      templateKey: this.templateKey,
      channel: this.channel,
      locale: this.locale,
      version: this.version,
      subject: this.subject,
      body: this.body,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Template;
