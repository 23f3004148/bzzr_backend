const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const interviewRepository = require('../repositories/interviewRepository');
const interviewAnswerRepository = require('../repositories/interviewAnswerRepository');
const ServiceError = require('../errors/serviceError');
const { generateFriendlyLoginId } = require('./idService');

const listUsers = () => userRepository.listAll();

const createUser = async ({ loginId, name, password, role, email }) => {
  if (!loginId || !name || !password) {
    throw new ServiceError('loginId, name, password required', 400, 'VALIDATION_ERROR');
  }
  const hash = await bcrypt.hash(password, 10);
  const user = await userRepository.createUser({
    loginId,
    email: email ? String(email).trim().toLowerCase() : undefined,
    name,
    passwordHash: hash,
    role: role === 'mentor' ? 'mentor' : 'user',
    wallet: { aiInterviewCredits: 0, mentorSessionCredits: 0 },
  });
  return user;
};

// Public self-registration (single dashboard user).
// Returns the created user.
const registerUser = async ({ name, email, password }) => {
  if (!name || !String(name).trim()) {
    throw new ServiceError('name is required', 400, 'VALIDATION_ERROR');
  }
  if (!email || !String(email).trim()) {
    throw new ServiceError('email is required', 400, 'VALIDATION_ERROR');
  }
  if (!password || !String(password).trim()) {
    throw new ServiceError('password is required', 400, 'VALIDATION_ERROR');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await userRepository.findByEmail(normalizedEmail);
  if (existing) {
    throw new ServiceError('Email already in use', 409, 'EMAIL_EXISTS');
  }

  const publicId = await generateFriendlyLoginId({ prefixLength: 3 });
  const hash = await bcrypt.hash(String(password), 10);

  const user = await userRepository.createUser({
    loginId: publicId,
    email: normalizedEmail,
    name: String(name).trim(),
    passwordHash: hash,
    role: 'user',
    active: true,
    wallet: { aiInterviewCredits: 0, mentorSessionCredits: 0 },
  });

  return user;
};

const updatePassword = async (userId, newPassword) => {
  if (!newPassword) {
    throw new ServiceError('newPassword required', 400, 'VALIDATION_ERROR');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await userRepository.updatePasswordHash(userId, hash);
};

const updateActive = async (userId, active) => {
  if (!userId) {
    throw new ServiceError('userId required', 400, 'VALIDATION_ERROR');
  }
  if (typeof active !== 'boolean') {
    throw new ServiceError('active must be boolean', 400, 'VALIDATION_ERROR');
  }
  const updated = await userRepository.updateActiveById(userId, active);
  if (!updated) {
    throw new ServiceError('User not found', 404, 'USER_NOT_FOUND');
  }
  return updated;
};

const deleteUser = async (userId) => {
  if (!userId) {
    throw new ServiceError('userId required', 400, 'VALIDATION_ERROR');
  }
  const interviewIds = await interviewRepository.findIdsByUserId(userId);
  await interviewAnswerRepository.deleteByInterviewIds(interviewIds);
  await interviewRepository.deleteByUserId(userId);
  await userRepository.deleteById(userId);
};

module.exports = {
  listUsers,
  createUser,
  registerUser,
  updatePassword,
  updateActive,
  deleteUser,
};
