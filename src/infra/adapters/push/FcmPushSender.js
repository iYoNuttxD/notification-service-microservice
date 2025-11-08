const admin = require('firebase-admin');
const handlebars = require('handlebars');

class FcmPushSender {
  constructor(config, logger, metrics) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.mockMode = process.env.MOCK_PROVIDERS === 'true';

    if (!this.mockMode) {
      try {
        // Initialize Firebase Admin
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: config.projectId,
              clientEmail: config.clientEmail,
              privateKey: config.privateKey?.replace(/\\n/g, '\n')
            })
          });
        }
        this.messaging = admin.messaging();
      } catch (error) {
        this.logger.warn('FCM initialization failed, push notifications disabled', {
          error: error.message
        });
        this.mockMode = true;
      }
    }
  }

  getChannel() {
    return 'push';
  }

  getProvider() {
    return 'fcm';
  }

  async send(notification, template) {
    const startTime = Date.now();

    try {
      if (!notification.recipient.deviceToken) {
        throw new Error('No device token provided');
      }

      // Render template
      const titleTemplate = handlebars.compile(template.subject || 'Notificação');
      const bodyTemplate = handlebars.compile(template.body);

      const title = titleTemplate(notification.metadata);
      const body = bodyTemplate(notification.metadata);

      const payload = {
        notification: {
          title,
          body
        },
        data: {
          notificationId: notification.id,
          eventId: notification.eventId,
          eventType: notification.eventType,
          ...Object.keys(notification.metadata).reduce((acc, key) => {
            acc[key] = String(notification.metadata[key]);
            return acc;
          }, {})
        },
        token: notification.recipient.deviceToken
      };

      notification.setRendered('push', payload);

      if (this.mockMode) {
        this.logger.info('MOCK: Push notification would be sent', {
          title,
          body: body.substring(0, 50),
          correlationId: notification.correlationId
        });

        return {
          success: true,
          providerMessageId: `mock-push-${Date.now()}`
        };
      }

      const messageId = await this.messaging.send(payload);

      const duration = Date.now() - startTime;
      this.metrics.recordSent('push', 'fcm', duration);

      this.logger.info('Push notification sent successfully', {
        notificationId: notification.id,
        messageId,
        correlationId: notification.correlationId
      });

      return {
        success: true,
        providerMessageId: messageId
      };
    } catch (error) {
      this.metrics.recordFailed('push', 'fcm', error.message);

      this.logger.error('Push notification send failed', {
        notificationId: notification.id,
        error: error.message,
        errorCode: error.code,
        correlationId: notification.correlationId
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'PUSH_SEND_FAILED'
      };
    }
  }
}

module.exports = FcmPushSender;
