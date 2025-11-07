const MongoNotificationRepository = require('./MongoNotificationRepository');
const MongoAttemptRepository = require('./MongoAttemptRepository');
const MongoTemplateRepository = require('./MongoTemplateRepository');
const MongoPreferencesRepository = require('./MongoPreferencesRepository');
const MongoInboxRepository = require('./MongoInboxRepository');

module.exports = {
  MongoNotificationRepository,
  MongoAttemptRepository,
  MongoTemplateRepository,
  MongoPreferencesRepository,
  MongoInboxRepository
};
