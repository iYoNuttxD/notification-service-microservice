const Preferences = require('../../../domain/entities/Preferences');

class GetPreferencesUseCase {
  constructor({ preferencesRepository, logger }) {
    this.preferencesRepository = preferencesRepository;
    this.logger = logger;
  }

  async execute(userId) {
    try {
      if (!userId) {
        throw new Error('userId is required');
      }

      const preferences = await this.preferencesRepository.findByUserId(userId);

      if (!preferences) {
        // Return default preferences if not found
        return Preferences.getDefaults();
      }

      return preferences;
    } catch (error) {
      this.logger.error('Failed to get preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = GetPreferencesUseCase;
