const Preferences = require('../../../domain/entities/Preferences');

class UpdatePreferencesUseCase {
  constructor({ preferencesRepository, logger }) {
    this.preferencesRepository = preferencesRepository;
    this.logger = logger;
  }

  async execute(userId, data) {
    try {
      if (!userId) {
        throw new Error('userId is required');
      }

      // Validate data structure
      if (data.channels && typeof data.channels !== 'object') {
        throw new Error('channels must be an object');
      }

      if (data.events && typeof data.events !== 'object') {
        throw new Error('events must be an object');
      }

      if (data.quietHours) {
        if (!data.quietHours.start || !data.quietHours.end) {
          throw new Error('quietHours must have start and end fields');
        }
        if (data.quietHours.start < 0 || data.quietHours.start > 23) {
          throw new Error('quietHours.start must be between 0 and 23');
        }
        if (data.quietHours.end < 0 || data.quietHours.end > 23) {
          throw new Error('quietHours.end must be between 0 and 23');
        }
      }

      const preferences = new Preferences({
        userId,
        channels: data.channels,
        events: data.events,
        quietHours: data.quietHours,
        locale: data.locale || 'pt-BR',
        updatedAt: new Date()
      });

      await this.preferencesRepository.save(preferences);

      this.logger.info('Preferences updated', { userId });

      return preferences;
    } catch (error) {
      this.logger.error('Failed to update preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = UpdatePreferencesUseCase;
