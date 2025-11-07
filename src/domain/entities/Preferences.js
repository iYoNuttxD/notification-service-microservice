class Preferences {
  constructor({
    userId,
    channels = { email: true, push: true, sms: false },
    events = {},
    quietHours = null,
    locale = 'pt-BR',
    updatedAt = new Date()
  }) {
    this.userId = userId;
    this.channels = channels;
    this.events = events;
    this.quietHours = quietHours;
    this.locale = locale;
    this.updatedAt = updatedAt;
  }

  isChannelEnabled(channel) {
    return this.channels[channel] === true;
  }

  isEventChannelEnabled(eventType, channel) {
    if (this.events[eventType]) {
      return this.events[eventType][channel] === true;
    }
    return this.isChannelEnabled(channel);
  }

  isInQuietHours() {
    if (!this.quietHours) return false;
    const now = new Date();
    const currentHour = now.getHours();
    const { start, end } = this.quietHours;

    if (start < end) {
      return currentHour >= start && currentHour < end;
    } else {
      return currentHour >= start || currentHour < end;
    }
  }

  static getDefaults() {
    return new Preferences({
      userId: null,
      channels: { email: true, push: true, sms: false },
      events: {},
      quietHours: null,
      locale: 'pt-BR'
    });
  }

  static fromDocument(doc) {
    return new Preferences({
      userId: doc._id,
      channels: doc.channels || { email: true, push: true, sms: false },
      events: doc.events || {},
      quietHours: doc.quietHours,
      locale: doc.locale || 'pt-BR',
      updatedAt: doc.updatedAt
    });
  }

  toDocument() {
    return {
      _id: this.userId,
      channels: this.channels,
      events: this.events,
      quietHours: this.quietHours,
      locale: this.locale,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Preferences;
