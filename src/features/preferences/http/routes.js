const express = require('express');
const Preferences = require('../../../domain/entities/Preferences');

function createPreferencesRoutes(container) {
  const router = express.Router();
  const { preferencesRepository, authVerifier, opaClient, logger } = container;

  // Auth middleware
  const authenticate = async (req, res, next) => {
    if (process.env.AUTH_JWT_REQUIRED !== 'true') {
      req.user = { sub: req.params.userId }; // Dev mode
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

  // PUT /api/v1/preferences/:userId - Update user preferences
  router.put('/preferences/:userId', authenticate, async (req, res) => {
    try {
      const { userId } = req.params;

      // Check if user can update these preferences
      if (req.user.role !== 'admin' && req.user.sub !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const featureEnabled = process.env.FEATURE_PREFERENCES === 'true';
      if (!featureEnabled) {
        return res.status(501).json({ error: 'Preferences feature not enabled' });
      }

      const preferences = new Preferences({
        userId,
        channels: req.body.channels,
        events: req.body.events,
        quietHours: req.body.quietHours,
        locale: req.body.locale || 'pt-BR',
        updatedAt: new Date()
      });

      await preferencesRepository.save(preferences);

      res.json({
        success: true,
        preferences
      });
    } catch (error) {
      logger.error('Failed to update preferences', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/preferences/:userId - Get user preferences
  router.get('/preferences/:userId', authenticate, async (req, res) => {
    try {
      const { userId } = req.params;

      // Check if user can read these preferences
      if (req.user.role !== 'admin' && req.user.sub !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const featureEnabled = process.env.FEATURE_PREFERENCES === 'true';
      if (!featureEnabled) {
        return res.status(501).json({ error: 'Preferences feature not enabled' });
      }

      const preferences = await preferencesRepository.findByUserId(userId);

      res.json(preferences);
    } catch (error) {
      logger.error('Failed to get preferences', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createPreferencesRoutes;
