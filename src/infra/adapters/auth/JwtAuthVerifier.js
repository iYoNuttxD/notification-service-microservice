const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

class JwtAuthVerifier {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;

    if (config.jwksUri) {
      this.jwksClient = jwksClient({
        jwksUri: config.jwksUri,
        cache: true,
        cacheMaxAge: 600000 // 10 minutes
      });
    }
  }

  async verify(token) {
    try {
      // Remove Bearer prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '');

      if (this.config.jwksUri) {
        // Verify with JWKS
        const decoded = jwt.decode(cleanToken, { complete: true });
        if (!decoded || !decoded.header.kid) {
          throw new Error('Invalid token format');
        }

        const key = await this.getSigningKey(decoded.header.kid);
        const verified = jwt.verify(cleanToken, key, {
          issuer: this.config.issuer,
          audience: this.config.audience,
          algorithms: ['RS256']
        });

        return verified;
      } else if (this.config.secret) {
        // Verify with secret (dev mode)
        const verified = jwt.verify(cleanToken, this.config.secret, {
          issuer: this.config.issuer,
          audience: this.config.audience
        });

        return verified;
      } else {
        throw new Error('No JWKS URI or secret configured');
      }
    } catch (error) {
      this.logger.error('JWT verification failed', {
        error: error.message
      });
      throw error;
    }
  }

  async getSigningKey(kid) {
    return new Promise((resolve, reject) => {
      this.jwksClient.getSigningKey(kid, (err, key) => {
        if (err) {
          reject(err);
        } else {
          const signingKey = key.getPublicKey();
          resolve(signingKey);
        }
      });
    });
  }
}

module.exports = JwtAuthVerifier;
