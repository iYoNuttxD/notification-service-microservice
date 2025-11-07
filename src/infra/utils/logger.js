const winston = require('winston');

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

function maskEmail(email) {
  if (!email) return '';
  const [username, domain] = email.split('@');
  if (!domain) return email;
  const maskedUsername = username.charAt(0) + '***' + username.charAt(username.length - 1);
  return `${maskedUsername}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return '';
  if (phone.length < 4) return '***';
  return phone.substring(0, 3) + '***' + phone.substring(phone.length - 2);
}

module.exports = { createLogger };
