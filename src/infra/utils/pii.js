/**
 * PII (Personally Identifiable Information) masking utilities
 * Used for logging and ensuring LGPD/GDPR compliance
 */

function maskEmail(email) {
  if (!email) return '';
  const [username, domain] = email.split('@');
  if (!domain) return email;
  if (username.length <= 2) return `${username.charAt(0)}***@${domain}`;
  const maskedUsername = username.charAt(0) + '***' + username.charAt(username.length - 1);
  return `${maskedUsername}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return '';
  if (phone.length < 4) return '***';
  return phone.substring(0, 3) + '***' + phone.substring(phone.length - 2);
}

function maskDeviceToken(token) {
  if (!token) return '';
  if (token.length < 10) return '***';
  return token.substring(0, 8) + '***' + token.substring(token.length - 4);
}

module.exports = {
  maskEmail,
  maskPhone,
  maskDeviceToken
};
