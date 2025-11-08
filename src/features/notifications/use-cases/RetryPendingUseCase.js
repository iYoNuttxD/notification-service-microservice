const Attempt = require('../../../domain/entities/Attempt');
const { getNextAttemptTime } = require('../../../infra/utils/backoff');

class RetryPendingUseCase {
  constructor({
    notificationRepository,
    attemptRepository,
    templateRepository,
    channelSenders,
    eventPublisher,
    logger,
    metrics,
    backoffSequence
  }) {
    this.notificationRepository = notificationRepository;
    this.attemptRepository = attemptRepository;
    this.templateRepository = templateRepository;
    this.channelSenders = channelSenders;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
    this.metrics = metrics;
    this.backoffSequence = backoffSequence;
  }

  async execute(notificationId) {
    try {
      if (!notificationId) {
        throw new Error('notificationId is required');
      }

      // Fetch notification
      const notification = await this.notificationRepository.findById(notificationId);
      if (!notification) {
        throw new Error(`Notification not found: ${notificationId}`);
      }

      // Only retry if status is RETRY or FAILED
      if (notification.status !== 'RETRY' && notification.status !== 'FAILED') {
        this.logger.warn('Notification not in retryable state', {
          notificationId,
          status: notification.status
        });
        return { success: false, reason: 'not_retryable' };
      }

      // Get attempt history for this notification
      const attempts = await this.attemptRepository.findByNotificationId(notificationId);

      // Determine which channels to retry based on attempt history
      const channelsToRetry = this.determineRetryChannels(notification, attempts);

      if (channelsToRetry.length === 0) {
        this.logger.info('No channels available for retry', {
          notificationId,
          channelsTried: notification.channelsTried
        });
        notification.updateStatus('FAILED');
        await this.notificationRepository.update(notification);
        await this.publishStatusUpdate(notification);
        return { success: false, reason: 'no_channels_available' };
      }

      // Try each channel
      for (const channel of channelsToRetry) {
        const result = await this.retryChannel(notification, channel, attempts);
        if (result.success) {
          notification.updateStatus('SENT');
          await this.notificationRepository.update(notification);
          await this.publishStatusUpdate(notification, result.attempt);
          this.logger.info('Notification retry succeeded', {
            notificationId,
            channel
          });
          return { success: true, channel };
        }
      }

      // All retries failed
      const totalAttempts = attempts.length + channelsToRetry.length;
      const maxAttempts = this.backoffSequence.length;

      if (totalAttempts >= maxAttempts) {
        // Give up - max attempts reached
        notification.updateStatus('FAILED');
        notification.setError('Max retry attempts reached');
        await this.notificationRepository.update(notification);
        await this.publishStatusUpdate(notification);
        this.logger.warn('Notification retry exhausted', {
          notificationId,
          totalAttempts,
          maxAttempts
        });
        return { success: false, reason: 'max_attempts_reached' };
      }

      // Schedule next retry
      const nextAttemptAt = getNextAttemptTime(totalAttempts, this.backoffSequence);
      if (nextAttemptAt) {
        notification.updateStatus('RETRY');
        notification.scheduleNextAttempt(nextAttemptAt);
        await this.notificationRepository.update(notification);
        this.logger.info('Notification retry scheduled', {
          notificationId,
          nextAttemptAt,
          attemptCount: totalAttempts
        });
        return { success: false, reason: 'scheduled_for_retry', nextAttemptAt };
      }

      // No more retries available
      notification.updateStatus('FAILED');
      await this.notificationRepository.update(notification);
      await this.publishStatusUpdate(notification);
      return { success: false, reason: 'retry_limit_reached' };
    } catch (error) {
      this.logger.error('Failed to retry notification', {
        error: error.message,
        notificationId
      });
      throw error;
    }
  }

  determineRetryChannels(notification, attempts) {
    // Get all available channels based on recipient
    const availableChannels = [];
    if (notification.recipient.deviceToken) availableChannels.push('push');
    if (notification.recipient.email) availableChannels.push('email');
    if (notification.recipient.phone && notification.recipient.role === 'deliverer') {
      availableChannels.push('sms');
    }

    // Filter out channels that have already succeeded or exceeded max attempts per channel
    const maxAttemptsPerChannel = parseInt(process.env.NOTIF_MAX_ATTEMPTS_PER_CHANNEL || '3', 10);
    const channelAttemptCount = {};

    attempts.forEach(attempt => {
      channelAttemptCount[attempt.channel] = (channelAttemptCount[attempt.channel] || 0) + 1;
    });

    return availableChannels.filter(channel => {
      const count = channelAttemptCount[channel] || 0;
      return count < maxAttemptsPerChannel;
    });
  }

  async retryChannel(notification, channel, previousAttempts) {
    const startTime = Date.now();

    try {
      const sender = this.channelSenders[channel];
      if (!sender) {
        this.logger.warn(`No sender configured for channel: ${channel}`);
        return { success: false, error: 'No sender configured' };
      }

      // Get template
      const template = await this.templateRepository.findByKey(
        notification.templateKey,
        channel,
        'pt-BR'
      );

      if (!template) {
        this.logger.warn('Template not found for retry', {
          templateKey: notification.templateKey,
          channel
        });
        return { success: false, error: 'Template not found' };
      }

      // Create attempt
      const attempt = new Attempt({
        notificationId: notification.id,
        channel,
        provider: sender.getProvider(),
        status: 'PENDING',
        attemptNumber: previousAttempts.filter(a => a.channel === channel).length + 1
      });

      this.metrics.recordDispatched(channel, sender.getProvider());
      this.metrics.recordInflight(channel, 1);

      // Send
      const result = await sender.send(notification, template);
      const duration = Date.now() - startTime;

      this.metrics.recordInflight(channel, -1);

      if (result.success) {
        attempt.markSuccess(result.providerMessageId);
        this.metrics.recordSent(channel, sender.getProvider(), duration);
        await this.attemptRepository.save(attempt);
        return { success: true, attempt };
      } else {
        attempt.markFailed(result.error, result.errorCode);
        this.metrics.recordFailed(channel, sender.getProvider(), result.errorCode || 'unknown');
        await this.attemptRepository.save(attempt);
        return { success: false, error: result.error };
      }
    } catch (error) {
      this.logger.error('Error retrying channel', {
        notificationId: notification.id,
        channel,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  async publishStatusUpdate(notification, attempt = null) {
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
}

module.exports = RetryPendingUseCase;
