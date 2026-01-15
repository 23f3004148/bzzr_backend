const crypto = require('crypto');
const userRepository = require('../repositories/userRepository');
const ServiceError = require('../errors/serviceError');

// Generate a mixed alphanumeric public user ID.
// Example: "A9K2Z7Q1M5" (length 10)
// Notes:
// - Uppercase only
// - Digits included
// - No special characters
const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const randomAlphanumeric = (length = 10) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUM[bytes[i] % ALPHANUM.length];
  }
  return out;
};

const randomLetters = (length = 3) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += LETTERS[bytes[i] % LETTERS.length];
  }
  return out;
};

// Format: AAA123 (3 letters + 3 digits), sequential numeric suffix.
const generateFriendlyLoginId = async ({ prefixLength = 3 } = {}) => {
  const last = await userRepository.findLatestByCreatedAt();
  let nextSeq = 1;
  if (last?.loginId) {
    const match = String(last.loginId).match(/^[A-Z]{2,3}(\\d{3})$/i);
    if (match) {
      nextSeq = Number.parseInt(match[1], 10) + 1;
    }
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const seq = String(nextSeq + attempt).padStart(3, '0');
    const prefix = randomLetters(Math.min(Math.max(prefixLength, 2), 3));
    const candidate = `${prefix}${seq}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await userRepository.findByLoginId(candidate);
    if (!existing) return candidate;
  }

  // Fallback to the legacy random generator if we cannot find a free ID.
  return randomAlphanumeric(10);
};

const generateUniqueLoginId = async ({ length = 10, maxAttempts = 25 } = {}) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = randomAlphanumeric(length);
    // eslint-disable-next-line no-await-in-loop
    const existing = await userRepository.findByLoginId(candidate);
    if (!existing) return candidate;
  }
  throw new ServiceError('Failed to generate unique user ID', 500, 'ID_GENERATION_FAILED');
};

module.exports = {
  generateFriendlyLoginId,
  generateUniqueLoginId,
};
