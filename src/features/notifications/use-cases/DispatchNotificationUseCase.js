const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Notification = require('../../../domain/entities/Notification');
const Attempt = require('../../../domain/entities/Attempt');
const eventSchema = require('../../../../docs/schemas/event.schema.json');

class DispatchNotificationUseCase {
  constructor({
    notificationRepository,
    attemptRepository,
    templateRepository,
    preferencesRepository,
    inboxRepository,
    channelSenders,
    eventPublisher,
    logger,
    metrics,
    backoffSequence
  }) {
    this.notificationRepository = notificationRepository;
    this.attemptRepository = attemptRepository;
    this.templateRepository = templateRepository;
    this.preferencesRepository = preferencesRepository;
    this.inboxRepository = inboxRepository;
    this.channelSenders = channelSenders;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
    this.metrics = metrics;
    this.backoffSequence = backoffSequence;

    // Setup schema validator
    const ajv = new Ajv();
    addFormats(ajv);
    this.validateEvent = ajv.compile(eventSchema);
  }

  async execute(event) {
    try {
      // Validate event schema
      if (!this.validateEvent(event)) {
        this.logger.error('Invalid event schema', {
          errors: this.validateEvent.errors,
          eventId: event.eventId
        });
        return { success: false, error: 'Invalid event schema' };
      }

      // Check for duplicates (idempotency)
      const isAlreadyProcessed = await this.inboxRepository.isProcessed(event.eventId);
      if (isAlreadyProcessed) {
        this.logger.info('Event already processed (dedupe)', {
          eventId: event.eventId
        });
        this.metrics.recordDedupeHit();
        return { success: true, reason: 'duplicate' };
      }

      // Mark as processed
      await this.inboxRepository.markProcessed(event.eventId);

      // Record metrics
      this.metrics.recordReceived(event.eventType);

      // Get user preferences
      const preferences = await this.getPreferences(event.recipient.userId);

      // Check quiet hours
      if (preferences.isInQuietHours()) {
        this.logger.info('User in quiet hours, notification delayed', {
          eventId: event.eventId,
          userId: event.recipient.userId
        });
        // Could implement delay logic here
      }

      // Create notification entity
      const notification = new Notification({
        eventId: event.eventId,
        eventType: event.eventType,
        recipient: event.recipient,
        templateKey: event.templateKey,
        metadata: event.data || {},
        idempotencyKey: `${event.eventId}`,
        correlationId: event.correlationId,
        traceId: event.traceId,
        status: 'QUEUED'
      });

      await this.notificationRepository.save(notification);

      // Determine channels to try based on preferences
      const channels = this.determineChannels(event, preferences);

      // Dispatch to channels with fallback
      await this.dispatchWithFallback(notification, channels, preferences);

      return { success: true, notificationId: notification.id };
    } catch (error) {
      this.logger.error('Failed to dispatch notification', {
        error: error.message,
        stack: error.stack,
        eventId: event.eventId
      });

      // Publish to DLQ
      await this.publishToDLQ(event, error);

      return { success: false, error: error.message };
    }
  }

  async getPreferences(userId) {
    if (!userId) {
      const Preferences = require('../../../domain/entities/Preferences');
      return Preferences.getDefaults();
    }

    const featureEnabled = process.env.FEATURE_PREFERENCES === 'true';
    if (!featureEnabled) {
      const Preferences = require('../../../domain/entities/Preferences');
      return Preferences.getDefaults();
    }

    return await this.preferencesRepository.findByUserId(userId);
  }

  determineChannels(event, preferences) {
    const channels = [];

    // Check channel availability based on recipient data
    if (event.recipient.deviceToken && preferences.isEventChannelEnabled(event.eventType, 'push')) {
      channels.push('push');
    }

    if (event.recipient.email && preferences.isEventChannelEnabled(event.eventType, 'email')) {
      channels.push('email');
    }

    // SMS only for deliverers or if explicitly enabled
    if (event.recipient.phone && preferences.isEventChannelEnabled(event.eventType, 'sms')) {
      if (event.recipient.role === 'deliverer' || preferences.channels.sms) {
        channels.push('sms');
      }
    }

    return channels;
  }

  async dispatchWithFallback(notification, channels, preferences) {
    let lastError = null;

    for (const channel of channels) {
      try {
        const sender = this.channelSenders[channel];
        if (!sender) {
          this.logger.warn(`No sender configured for channel: ${channel}`);
          continue;
        }

        // Get template
        const template = await this.templateRepository.findByKey(
          notification.templateKey,
          channel,
          preferences.locale
        );

        if (!template) {
          this.logger.warn('Template not found', {
            templateKey: notification.templateKey,
            channel,
            locale: preferences.locale
          });
          continue;
        }

        // Create attempt
        const attempt = new Attempt({
          notificationId: notification.id,
          channel,
          provider: sender.getProvider(),
          status: 'PENDING'
        });

        notification.markChannelTried(channel);
        this.metrics.recordDispatched(channel, sender.getProvider());
        this.metrics.recordInflight(channel, 1);

        // Send
        const result = await sender.send(notification, template);

        this.metrics.recordInflight(channel, -1);

        if (result.success) {
          attempt.markSuccess(result.providerMessageId);
          notification.updateStatus('SENT');
          await this.attemptRepository.save(attempt);
          await this.notificationRepository.update(notification);

          // Publish status update
          await this.publishStatusUpdate(notification, attempt);

          this.logger.info('Notification sent successfully', {
            notificationId: notification.id,
            channel,
            provider: sender.getProvider()
          });

          return; // Success, no need for fallback
        } else {
          attempt.markFailed(result.error, result.errorCode);
          await this.attemptRepository.save(attempt);
          lastError = result.error;

          this.logger.warn('Channel delivery failed, trying fallback', {
            notificationId: notification.id,
            channel,
            error: result.error
          });
        }
      } catch (error) {
        this.logger.error('Error dispatching to channel', {
          notificationId: notification.id,
          channel,
          error: error.message
        });
        lastError = error.message;
      }
    }

    // All channels failed
    notification.updateStatus('FAILED');
    notification.setError(lastError);
    await this.notificationRepository.update(notification);

    // Publish status update
    await this.publishStatusUpdate(notification, null);
  }

  async publishStatusUpdate(notification, attempt) {
    try {
      const statusData = {
        eventId: notification.eventId,
        notificationId: notification.id,
        status: notification.status,
        channel: attempt?.channel,
        provider: attempt?.provider,
        providerMessageId: attempt?.providerMessageId,
        errorCode: attempt?.errorCode,
        timestamp: new Date().toISOString(),
        correlationId: notification.correlationId,
        traceId: notification.traceId
      };

      await this.eventPublisher.publish('notifications.status.updated', statusData);
    } catch (error) {
      this.logger.error('Failed to publish status update', {
        error: error.message,
        notificationId: notification.id
      });
    }
  }

  async publishToDLQ(event, error) {
    try {
      const dlqData = {
        ...event,
        error: error.message,
        timestamp: new Date().toISOString()
      };

      await this.eventPublisher.publish('notifications.dlq', dlqData);
    } catch (err) {
      this.logger.error('Failed to publish to DLQ', {
        error: err.message,
        eventId: event.eventId
      });
    }
  }
}

module.exports = DispatchNotificationUseCase;
