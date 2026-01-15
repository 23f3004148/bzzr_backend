const User = require('../models/user');

const findByLoginId = (loginId) => User.findOne({ loginId });
const findByEmail = (email) => User.findOne({ email: String(email || '').toLowerCase() });
const findActiveByLoginId = (loginId) => User.findOne({ loginId, active: true });
const findActiveByEmail = (email) =>
  User.findOne({ email: String(email || '').toLowerCase(), active: true });

// Identifier can be either loginId (public alphanumeric ID) or email.
const findActiveByIdentifier = (identifier) => {
  const raw = String(identifier || '').trim();
  if (!raw) return User.findOne({ _id: null });
  const lowered = raw.toLowerCase();
  const upper = raw.toUpperCase();
  return User.findOne({
    active: true,
    $or: [{ loginId: raw }, { loginId: upper }, { email: lowered }],
  });
};
const findById = (id) => User.findById(id);
const findAdmin = () => User.findOne({ role: 'admin' });
const listAll = () => User.find().sort({ createdAt: 1 });
const createUser = (payload) => User.create(payload);
const updatePasswordHash = (userId, passwordHash) =>
  User.updateOne({ _id: userId }, { passwordHash });
const updateActiveById = (userId, active) =>
  User.findByIdAndUpdate(userId, { active }, { new: true });
const deleteById = (userId) => User.deleteOne({ _id: userId });
const findLatestByCreatedAt = () => User.findOne().sort({ createdAt: -1 });

module.exports = {
  findByLoginId,
  findByEmail,
  findActiveByLoginId,
  findActiveByEmail,
  findActiveByIdentifier,
  findById,
  findAdmin,
  listAll,
  createUser,
  updatePasswordHash,
  updateActiveById,
  deleteById,
  findLatestByCreatedAt,
};
