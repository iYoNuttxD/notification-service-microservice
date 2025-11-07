function parseBackoffSequence(sequence) {
  if (!sequence) {
    return [5000, 25000, 120000, 600000, 1800000, 7200000, 21600000, 86400000];
  }

  return sequence.split(',').map(parseTime);
}

function parseTime(timeStr) {
  const units = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };

  const match = timeStr.trim().match(/^(\d+)([smhd])$/);
  if (!match) {
    return parseInt(timeStr, 10);
  }

  const [, value, unit] = match;
  return parseInt(value, 10) * units[unit];
}

function getNextAttemptTime(attemptCount, backoffSequence) {
  if (attemptCount >= backoffSequence.length) {
    return null; // No more attempts
  }

  const delay = backoffSequence[attemptCount];
  return new Date(Date.now() + delay);
}

module.exports = {
  parseBackoffSequence,
  getNextAttemptTime
};
