const winston = require('winston');
const { maskEmail, maskPhone } = require('./pii');

function createLogger() {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Mask PII data
  const maskPII = winston.format((info) => {
    if (info.email) {
      info.email = maskEmail(info.email);
    }
    if (info.phone) {
      info.phone = maskPhone(info.phone);
    }
    if (info.to && typeof info.to === 'string' && info.to.includes('@')) {
      info.to = maskEmail(info.to);
    }
    return info;
  });

  const formats = [
    winston.format.timestamp(),
    maskPII(),
    winston.format.errors({ stack: true })
  ];

  if (nodeEnv === 'production') {
    formats.push(winston.format.json());
  } else {
    formats.push(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
      })
    );
  }

  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(...formats),
    transports: [
      new winston.transports.Console()
    ]
  });

  return logger;
}

module.exports = { createLogger };
