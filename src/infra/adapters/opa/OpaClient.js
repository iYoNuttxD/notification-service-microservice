const axios = require('axios');

class OpaClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.failOpen = config.failOpen !== 'false';
  }

  async authorize(input) {
    try {
      const response = await axios.post(
        `${this.config.url}${this.config.policyPath}`,
        { input },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const allowed = response.data?.result?.allow === true;

      this.logger.debug('OPA authorization result', {
        allowed,
        userId: input.user?.sub,
        action: input.action
      });

      return allowed;
    } catch (error) {
      this.logger.error('OPA authorization failed', {
        error: error.message,
        failOpen: this.failOpen
      });

      if (this.failOpen) {
        this.logger.warn('OPA fail-open: allowing request');
        return true;
      }

      return false;
    }
  }
}

module.exports = OpaClient;
