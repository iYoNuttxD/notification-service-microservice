async function setupSubscribers(container) {
  const { natsEventBus, dispatchNotificationUseCase, logger } = container;

  const subjects = (process.env.NATS_SUBJECTS || '').split(',').filter(s => s.trim());

  if (subjects.length === 0) {
    logger.warn('No NATS subjects configured for subscription');
    return;
  }

  logger.info('Setting up NATS subscribers', { subjects });

  await natsEventBus.subscribe(subjects, async (subject, data) => {
    logger.info('Received NATS message', {
      subject,
      eventId: data.eventId,
      eventType: data.eventType
    });

    try {
      await dispatchNotificationUseCase.execute(data);
    } catch (error) {
      logger.error('Failed to process NATS message', {
        subject,
        eventId: data.eventId,
        error: error.message
      });
    }
  });

  logger.info('NATS subscribers initialized successfully');
}

module.exports = { setupSubscribers };
