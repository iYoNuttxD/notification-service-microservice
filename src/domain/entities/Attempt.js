class Attempt {
  constructor({
    id,
    notificationId,
    channel,
    provider,
    status = 'PENDING',
    error = null,
    errorCode = null,
    providerMessageId = null,
    durationMs = null,
    startedAt = new Date(),
    finishedAt = null
  }) {
    this.id = id;
    this.notificationId = notificationId;
    this.channel = channel;
    this.provider = provider;
    this.status = status;
    this.error = error;
    this.errorCode = errorCode;
    this.providerMessageId = providerMessageId;
    this.durationMs = durationMs;
    this.startedAt = startedAt;
    this.finishedAt = finishedAt;
  }

  markSuccess(providerMessageId) {
    this.status = 'SUCCESS';
    this.providerMessageId = providerMessageId;
    this.finishedAt = new Date();
    this.durationMs = this.finishedAt - this.startedAt;
  }

  markFailed(error, errorCode = null) {
    this.status = 'FAILED';
    this.error = error;
    this.errorCode = errorCode;
    this.finishedAt = new Date();
    this.durationMs = this.finishedAt - this.startedAt;
  }

  static fromDocument(doc) {
    return new Attempt({
      id: doc._id?.toString(),
      notificationId: doc.notificationId,
      channel: doc.channel,
      provider: doc.provider,
      status: doc.status,
      error: doc.error,
      errorCode: doc.errorCode,
      providerMessageId: doc.providerMessageId,
      derationMs: doc.durationMs,
      startedAt: doc.startedAt,
      finishedAt: doc.finishedAt
    });
  }

  toDocument() {
    return {
      notificationId: this.notificationId,
      channel: this.channel,
      provider: this.provider,
      status: this.status,
      error: this.error,
      errorCode: this.errorCode,
      providerMessageId: this.providerMessageId,
      durationMs: this.durationMs,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt
    };
  }
}

module.exports = Attempt;
