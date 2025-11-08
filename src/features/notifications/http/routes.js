const express = require('express');

function createNotificationRoutes(container) {
  const router = express.Router();
  const { notificationRepository, dispatchNotificationUseCase, authVerifier, opaClient, logger } = container;

  // Auth middleware
  const authenticate = async (req, res, next) => {
    if (process.env.AUTH_JWT_REQUIRED !== 'true') {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    try {
      const user = await authVerifier.verify(authHeader);
      req.user = user;
      next();
    } catch (error) {
      logger.error('Authentication failed', { error: error.message });
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Authorization middleware
  const authorize = (action) => async (req, res, next) => {
    if (process.env.AUTH_JWT_REQUIRED !== 'true') {
      return next();
    }

    try {
      const allowed = await opaClient.authorize({
        user: req.user,
        action,
        resource: req.params
      });

      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      next();
    } catch (error) {
      logger.error('Authorization failed', { error: error.message });
      res.status(500).json({ error: 'Authorization error' });
    }
  };

  // POST /api/v1/notifications - Create notification (admin/internal)
  router.post('/notifications', authenticate, authorize('create'), async (req, res) => {
    try {
      const event = {
        eventId: req.body.eventId || `manual-${Date.now()}`,
        eventType: req.body.eventType || 'manual',
        occurredAt: new Date().toISOString(),
        recipient: req.body.recipient,
        templateKey: req.body.templateKey,
        data: req.body.data || {},
        correlationId: req.headers['x-correlation-id'],
        traceId: req.headers['x-trace-id']
      };

      const result = await dispatchNotificationUseCase.execute(event);

      if (result.success) {
        res.status(201).json({
          success: true,
          notificationId: result.notificationId
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Failed to create notification', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/notifications/:id - Get notification by ID
  router.get('/notifications/:id', authenticate, authorize('read'), async (req, res) => {
    try {
      const notification = await notificationRepository.findById(req.params.id);

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      // Check if user can access this notification
      if (req.user && req.user.role !== 'admin') {
        if (notification.recipient.userId !== req.user.sub) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      res.json(notification);
    } catch (error) {
      logger.error('Failed to get notification', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/notifications - List notifications with filters
  router.get('/notifications', authenticate, authorize('list'), async (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        'recipient.userId': req.query['recipient.userId'],
        eventType: req.query.eventType,
        from: req.query.from,
        to: req.query.to,
        page: req.query.page,
        limit: req.query.limit
      };

      // Non-admin users can only see their own notifications
      if (req.user && req.user.role !== 'admin') {
        filters['recipient.userId'] = req.user.sub;
      }

      const result = await notificationRepository.findByFilters(filters);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list notifications', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/notifications/user/:userId - Delete all user data (LGPD/GDPR)
  router.delete('/notifications/user/:userId', authenticate, authorize('delete_user_data'), async (req, res) => {
    try {
      const { userId } = req.params;

      // Only admin can delete user data
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden - Admin access required' });
      }

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Delete from all repositories
      const { notificationRepository, attemptRepository, preferencesRepository } = container;

      const deletionResults = {
        notifications: 0,
        attempts: 0,
        preferences: 0
      };

      // First, get all notification IDs for this user (needed to delete attempts)
      const userNotifications = await notificationRepository.findByFilters({
        'recipient.userId': userId,
        limit: 10000
      });

      const notificationIds = userNotifications.data.map(n => n.id);

      // Delete attempts for these notifications
      if (notificationIds.length > 0) {
        try {
          deletionResults.attempts = await attemptRepository.deleteByNotificationIds(notificationIds);
        } catch (error) {
          logger.warn('Failed to delete attempts', { error: error.message, userId });
        }
      }

      // Delete notifications
      try {
        deletionResults.notifications = await notificationRepository.deleteByUserId(userId);
      } catch (error) {
        logger.warn('Failed to delete notifications', { error: error.message, userId });
      }

      // Delete preferences
      try {
        deletionResults.preferences = await preferencesRepository.deleteByUserId(userId);
      } catch (error) {
        logger.warn('Failed to delete preferences', { error: error.message, userId });
      }

      logger.info('User data deleted (LGPD/GDPR)', {
        userId,
        deletionResults
      });

      res.json({
        success: true,
        message: 'User data deleted successfully',
        deletionResults
      });
    } catch (error) {
      logger.error('Failed to delete user data', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createNotificationRoutes;
