const { connect, StringCodec } = require('nats');

class NatsEventBus {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.nc = null;
    this.sc = StringCodec();
  }

  async connect() {
    try {
      this.nc = await connect({
        servers: this.config.url
      });

      this.logger.info('Connected to NATS', {
        server: this.config.url
      });

      // Handle connection events
      (async () => {
        for await (const status of this.nc.status()) {
          this.logger.info('NATS status change', {
            type: status.type,
            data: status.data
          });
        }
      })();
    } catch (error) {
      this.logger.error('Failed to connect to NATS', {
        error: error.message
      });
      throw error;
    }
  }

  async subscribe(subjects, handler) {
    if (!this.nc) {
      throw new Error('Not connected to NATS');
    }

    const queueGroup = this.config.queueGroup || 'notification-service-workers';

    for (const subject of subjects) {
      const sub = this.nc.subscribe(subject, { queue: queueGroup });

      this.logger.info('Subscribed to NATS subject', {
        subject,
        queueGroup
      });

      (async () => {
        for await (const msg of sub) {
          try {
            const data = JSON.parse(this.sc.decode(msg.data));
            await handler(subject, data);
          } catch (error) {
            this.logger.error('Error processing NATS message', {
              subject,
              error: error.message
            });
          }
        }
      })();
    }
  }

  async publish(subject, data) {
    if (!this.nc) {
      throw new Error('Not connected to NATS');
    }

    try {
      const payload = this.sc.encode(JSON.stringify(data));
      this.nc.publish(subject, payload);

      this.logger.debug('Published to NATS', {
        subject,
        eventId: data.eventId
      });
    } catch (error) {
      this.logger.error('Failed to publish to NATS', {
        subject,
        error: error.message
      });
      throw error;
    }
  }

  async close() {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.logger.info('Disconnected from NATS');
    }
  }
}

module.exports = NatsEventBus;
