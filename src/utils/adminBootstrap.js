const bcrypt = require('bcryptjs');
const UserModel = require('../models/user');

/**
 * Ensures there is at least one admin user in the database.
 * Uses ADMIN_EMAIL/ADMIN_PASSWORD from env. If an admin already exists, it is
 * left untouched unless allowUpdate is true (useful for manual resets).
 */
const ensureAdminUser = async ({ allowUpdate = false, logger = console } = {}) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    logger?.warn?.(
      '[bootstrap] Skipping admin bootstrap: ADMIN_EMAIL or ADMIN_PASSWORD not set'
    );
    return { skipped: true, reason: 'missing_env' };
  }

  const existing = await UserModel.findOne({ role: 'admin' });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await UserModel.create({
      name,
      email,
      loginId: email,
      passwordHash,
      role: 'admin',
      active: true,
      createdAt: new Date(),
    });
    logger?.log?.(`[bootstrap] Admin user created: ${email}`);
    return { created: true, adminId: admin._id };
  }

  if (!allowUpdate) {
    logger?.log?.('[bootstrap] Admin user already exists; skipping bootstrap');
    return { skipped: true, reason: 'exists' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  existing.name = name;
  existing.email = email;
  existing.loginId = email;
  existing.passwordHash = passwordHash;
  existing.active = true;
  await existing.save();
  logger?.log?.(`[bootstrap] Admin user updated: ${email}`);
  return { updated: true, adminId: existing._id };
};

module.exports = { ensureAdminUser };
