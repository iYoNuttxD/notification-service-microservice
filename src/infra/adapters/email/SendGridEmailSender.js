const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const { maskEmail } = require('../../utils/pii');

class SendGridEmailSender {
  constructor(config, logger, metrics) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.mockMode = process.env.MOCK_PROVIDERS === 'true';

    if (!this.mockMode) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.pass
        }
      });
    }
  }

  getChannel() {
    return 'email';
  }

  getProvider() {
    return 'sendgrid';
  }

  async send(notification, template) {
    const startTime = Date.now();

    try {
      if (!notification.recipient.email) {
        throw new Error('No email address provided');
      }

      // Render template
      const subjectTemplate = handlebars.compile(template.subject || 'Notificação');
      const bodyTemplate = handlebars.compile(template.body);

      const subject = subjectTemplate(notification.metadata);
      const html = bodyTemplate(notification.metadata);

      // For text version, use the rendered HTML as-is since our templates are plain text friendly
      // In production, consider using a proper HTML-to-text library if templates contain HTML
      const text = html;

      notification.setRendered('email', { subject, html, text });

      if (this.mockMode) {
        this.logger.info('MOCK: Email would be sent', {
          to: maskEmail(notification.recipient.email),
          subject,
          correlationId: notification.correlationId
        });

        return {
          success: true,
          providerMessageId: `mock-email-${Date.now()}`
        };
      }

      const mailOptions = {
        from: this.config.from,
        to: notification.recipient.email,
        subject,
        text,
        html,
        headers: {
          'X-Notification-Id': notification.id,
          'X-Event-Id': notification.eventId,
          'X-Correlation-Id': notification.correlationId
        }
      };

      const info = await this.transporter.sendMail(mailOptions);

      const duration = Date.now() - startTime;
      this.metrics.recordSent('email', 'sendgrid', duration);

      this.logger.info('Email sent successfully', {
        notificationId: notification.id,
        to: maskEmail(notification.recipient.email),
        messageId: info.messageId,
        correlationId: notification.correlationId
      });

      return {
        success: true,
        providerMessageId: info.messageId
      };
    } catch (error) {
      this.metrics.recordFailed('email', 'sendgrid', error.message);

      this.logger.error('Email send failed', {
        notificationId: notification.id,
        error: error.message,
        correlationId: notification.correlationId
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'EMAIL_SEND_FAILED'
      };
    }
  }
}

module.exports = SendGridEmailSender;
