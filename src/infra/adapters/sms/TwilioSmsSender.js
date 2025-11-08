const twilio = require('twilio');
const handlebars = require('handlebars');
const { maskPhone } = require('../../utils/pii');

class TwilioSmsSender {
  constructor(config, logger, metrics) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.mockMode = process.env.MOCK_PROVIDERS === 'true';

    if (!this.mockMode) {
      this.client = twilio(config.accountSid, config.authToken);
    }
  }

  getChannel() {
    return 'sms';
  }

  getProvider() {
    return 'twilio';
  }

  async send(notification, template) {
    const startTime = Date.now();

    try {
      if (!notification.recipient.phone) {
        throw new Error('No phone number provided');
      }

      // SMS prioritized for deliverers
      if (notification.recipient.role !== 'deliverer') {
        this.logger.debug('SMS skipped - not a deliverer', {
          notificationId: notification.id,
          role: notification.recipient.role
        });
        return {
          success: false,
          error: 'SMS only enabled for deliverers',
          errorCode: 'SMS_ROLE_RESTRICTED'
        };
      }

      // Render template
      const bodyTemplate = handlebars.compile(template.body);
      const body = bodyTemplate(notification.metadata);

      notification.setRendered('sms', { body });

      if (this.mockMode) {
        this.logger.info('MOCK: SMS would be sent', {
          to: maskPhone(notification.recipient.phone),
          body: body.substring(0, 50),
          correlationId: notification.correlationId
        });

        return {
          success: true,
          providerMessageId: `mock-sms-${Date.now()}`
        };
      }

      const message = await this.client.messages.create({
        body,
        from: this.config.from,
        to: notification.recipient.phone
      });

      const duration = Date.now() - startTime;
      this.metrics.recordSent('sms', 'twilio', duration);

      this.logger.info('SMS sent successfully', {
        notificationId: notification.id,
        to: maskPhone(notification.recipient.phone),
        messageSid: message.sid,
        correlationId: notification.correlationId
      });

      return {
        success: true,
        providerMessageId: message.sid
      };
    } catch (error) {
      this.metrics.recordFailed('sms', 'twilio', error.message);

      this.logger.error('SMS send failed', {
        notificationId: notification.id,
        error: error.message,
        code: error.code,
        correlationId: notification.correlationId
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'SMS_SEND_FAILED'
      };
    }
  }
}

module.exports = TwilioSmsSender;
