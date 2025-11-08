const { maskEmail, maskPhone } = require('../../../infra/utils/pii');

class PublishStatusUseCase {
  constructor({ eventPublisher, logger }) {
    this.eventPublisher = eventPublisher;
    this.logger = logger;
  }

  async execute(notification, attempt = null) {
    try {
      if (!notification) {
        throw new Error('notification is required');
      }

      // Build status data with PII masking for logs
      const statusData = {
        eventId: notification.eventId,
        notificationId: notification.id,
        status: notification.status,
        eventType: notification.eventType,
        channel: attempt?.channel,
        provider: attempt?.provider,
        providerMessageId: attempt?.providerMessageId,
        errorCode: attempt?.errorCode,
        error: attempt?.error || notification.lastError,
        timestamp: new Date().toISOString(),
        correlationId: notification.correlationId,
        traceId: notification.traceId,
        recipient: {
          userId: notification.recipient.userId,
          role: notification.recipient.role
        }
      };

      // Publish status update event
      await this.eventPublisher.publish('notifications.status.updated', statusData);

      this.logger.info('Status update published', {
        notificationId: notification.id,
        status: notification.status,
        channel: attempt?.channel,
        recipientEmail: notification.recipient.email ? maskEmail(notification.recipient.email) : undefined,
        recipientPhone: notification.recipient.phone ? maskPhone(notification.recipient.phone) : undefined
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to publish status update', {
        error: error.message,
        notificationId: notification?.id
      });
      // Don't throw - status publishing is best-effort
      return { success: false, error: error.message };
    }
  }
}

module.exports = PublishStatusUseCase;
