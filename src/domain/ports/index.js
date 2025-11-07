/**
 * Port: NotificationRepository
 * Interface for notification persistence operations
 */
class NotificationRepository {
  async save(notification) {
    throw new Error('NotificationRepository.save must be implemented');
  }

  async findById(id) {
    throw new Error('NotificationRepository.findById must be implemented');
  }

  async findByEventId(eventId) {
    throw new Error('NotificationRepository.findByEventId must be implemented');
  }

  async findPendingRetries() {
    throw new Error('NotificationRepository.findPendingRetries must be implemented');
  }

  async findByFilters(filters) {
    throw new Error('NotificationRepository.findByFilters must be implemented');
  }

  async update(notification) {
    throw new Error('NotificationRepository.update must be implemented');
  }

  async deleteByUserId(userId) {
    throw new Error('NotificationRepository.deleteByUserId must be implemented');
  }
}

/**
 * Port: AttemptRepository
 * Interface for attempt persistence operations
 */
class AttemptRepository {
  async save(attempt) {
    throw new Error('AttemptRepository.save must be implemented');
  }

  async findByNotificationId(notificationId) {
    throw new Error('AttemptRepository.findByNotificationId must be implemented');
  }
}

/**
 * Port: TemplateRepository
 * Interface for template persistence operations
 */
class TemplateRepository {
  async findByKey(templateKey, channel, locale) {
    throw new Error('TemplateRepository.findByKey must be implemented');
  }

  async save(template) {
    throw new Error('TemplateRepository.save must be implemented');
  }

  async seedDefaults() {
    throw new Error('TemplateRepository.seedDefaults must be implemented');
  }
}

/**
 * Port: PreferencesRepository
 * Interface for user preferences persistence operations
 */
class PreferencesRepository {
  async findByUserId(userId) {
    throw new Error('PreferencesRepository.findByUserId must be implemented');
  }

  async save(preferences) {
    throw new Error('PreferencesRepository.save must be implemented');
  }
}

/**
 * Port: InboxRepository
 * Interface for idempotency/deduplication operations
 */
class InboxRepository {
  async isProcessed(eventId) {
    throw new Error('InboxRepository.isProcessed must be implemented');
  }

  async markProcessed(eventId) {
    throw new Error('InboxRepository.markProcessed must be implemented');
  }
}

/**
 * Port: ChannelSender
 * Interface for channel-specific notification senders
 */
class ChannelSender {
  async send(notification, template) {
    throw new Error('ChannelSender.send must be implemented');
  }

  getChannel() {
    throw new Error('ChannelSender.getChannel must be implemented');
  }

  getProvider() {
    throw new Error('ChannelSender.getProvider must be implemented');
  }
}

/**
 * Port: EventSubscriber
 * Interface for event subscription (NATS)
 */
class EventSubscriber {
  async subscribe(subjects, handler) {
    throw new Error('EventSubscriber.subscribe must be implemented');
  }

  async close() {
    throw new Error('EventSubscriber.close must be implemented');
  }
}

/**
 * Port: EventPublisher
 * Interface for event publishing (NATS)
 */
class EventPublisher {
  async publish(subject, data) {
    throw new Error('EventPublisher.publish must be implemented');
  }
}

/**
 * Port: OPAClient
 * Interface for policy authorization
 */
class OPAClient {
  async authorize(input) {
    throw new Error('OPAClient.authorize must be implemented');
  }
}

/**
 * Port: AuthTokenVerifier
 * Interface for JWT token verification
 */
class AuthTokenVerifier {
  async verify(token) {
    throw new Error('AuthTokenVerifier.verify must be implemented');
  }
}

/**
 * Port: Clock
 * Interface for time operations (testable)
 */
class Clock {
  now() {
    return new Date();
  }
}

module.exports = {
  NotificationRepository,
  AttemptRepository,
  TemplateRepository,
  PreferencesRepository,
  InboxRepository,
  ChannelSender,
  EventSubscriber,
  EventPublisher,
  OPAClient,
  AuthTokenVerifier,
  Clock
};
