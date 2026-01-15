const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const adminSettingsRepository = require('../repositories/adminSettingsRepository');
const ServiceError = require('../errors/serviceError');

const login = async ({ loginId, password }) => {
  // loginId here acts as a generic identifier: either public userId or email.
  const user = await userRepository.findActiveByIdentifier(loginId);
  if (!user) {
    throw new ServiceError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new ServiceError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const settings = await adminSettingsRepository.getConfig();

  return { user, defaultProvider: settings.defaultProvider };
};

const getUserById = async (id) => {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new ServiceError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
};

module.exports = {
  login,
  getUserById,
};
