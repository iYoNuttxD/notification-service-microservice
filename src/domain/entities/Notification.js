class Notification {
  constructor({
    id,
    eventId,
    eventType,
    recipient,
    channelsTried = [],
    status = 'QUEUED',
    lastError = null,
    templateKey,
    rendered = {},
    metadata = {},
    createdAt = new Date(),
    updatedAt = new Date(),
    idempotencyKey,
    nextAttemptAt = null,
    correlationId = null,
    traceId = null
  }) {
    this.id = id;
    this.eventId = eventId;
    this.eventType = eventType;
    this.recipient = recipient;
    this.channelsTried = channelsTried;
    this.status = status;
    this.lastError = lastError;
    this.templateKey = templateKey;
    this.rendered = rendered;
    this.metadata = metadata;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.idempotencyKey = idempotencyKey;
    this.nextAttemptAt = nextAttemptAt;
    this.correlationId = correlationId;
    this.traceId = traceId;
  }

  markChannelTried(channel) {
    if (!this.channelsTried.includes(channel)) {
      this.channelsTried.push(channel);
    }
    this.updatedAt = new Date();
  }

  updateStatus(status) {
    this.status = status;
    this.updatedAt = new Date();
  }

  setError(error) {
    this.lastError = error;
    this.updatedAt = new Date();
  }

  scheduleNextAttempt(nextAttemptAt) {
    this.nextAttemptAt = nextAttemptAt;
    this.updatedAt = new Date();
  }

  setRendered(channel, content) {
    this.rendered[channel] = content;
    this.updatedAt = new Date();
  }

  isDeliverer() {
    return this.recipient?.role === 'deliverer';
  }

  static fromDocument(doc) {
    return new Notification({
      id: doc._id?.toString(),
      eventId: doc.eventId,
      eventType: doc.eventType,
      recipient: doc.recipient,
      channelsTried: doc.channelsTried || [],
      status: doc.status,
      lastError: doc.lastError,
      templateKey: doc.templateKey,
      rendered: doc.rendered || {},
      metadata: doc.metadata || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      idempotencyKey: doc.idempotencyKey,
      nextAttemptAt: doc.nextAttemptAt,
      correlationId: doc.correlationId,
      traceId: doc.traceId
    });
  }

  toDocument() {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      recipient: this.recipient,
      channelsTried: this.channelsTried,
      status: this.status,
      lastError: this.lastError,
      templateKey: this.templateKey,
      rendered: this.rendered,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      idempotencyKey: this.idempotencyKey,
      nextAttemptAt: this.nextAttemptAt,
      correlationId: this.correlationId,
      traceId: this.traceId
    };
  }
}

module.exports = Notification;
