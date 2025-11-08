/**
 * RetryScheduler
 *
 * Periodically checks for notifications that need to be retried when NATS JetStream is disabled.
 * Fetches notifications with status RETRY or QUEUED that have nextAttemptAt <= now and processes them.
 */

class RetryScheduler {
  constructor({
    notificationRepository,
    retryPendingUseCase,
    logger,
    intervalMs = 30000 // 30 seconds default
  }) {
    this.notificationRepository = notificationRepository;
    this.retryPendingUseCase = retryPendingUseCase;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      this.logger.warn('RetryScheduler already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting RetryScheduler', { intervalMs: this.intervalMs });

    // Run immediately
    this.processRetries();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.processRetries();
    }, this.intervalMs);
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping RetryScheduler');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processRetries() {
    if (!this.isRunning) {
      return;
    }

    try {
      // Fetch pending retries
      const pendingNotifications = await this.notificationRepository.findPendingRetries();

      if (pendingNotifications.length === 0) {
        this.logger.debug('No pending retries found');
        return;
      }

      this.logger.info('Processing pending retries', {
        count: pendingNotifications.length
      });

      // Process each notification
      for (const notification of pendingNotifications) {
        try {
          await this.retryPendingUseCase.execute(notification.id);
        } catch (error) {
          this.logger.error('Failed to retry notification', {
            error: error.message,
            notificationId: notification.id
          });
        }
      }

      this.logger.info('Finished processing retries', {
        processed: pendingNotifications.length
      });
    } catch (error) {
      this.logger.error('Error in retry scheduler', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = RetryScheduler;
