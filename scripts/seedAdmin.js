#!/usr/bin/env node
/**
 * Seeds or updates the admin user using env vars.
 * Usage:
 *   npm run seed:admin
 *   npm run seed:admin -- --force   (overwrite existing admin)
 */
require('../src/utils/env');
const { ensureAdminUser } = require('../src/utils/adminBootstrap');

const force =
  process.argv.includes('--force') ||
  String(process.env.ADMIN_FORCE_UPDATE || '').toLowerCase() === 'true';

const validateEnv = () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is required to seed the admin user.');
    return false;
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin user.');
    return false;
  }
  return true;
};

if (!validateEnv()) {
  process.exit(1);
}

const mongoose = require('../src/db/mongo');

const shutdown = async (code = 0) => {
  try {
    await mongoose.connection.close();
  } catch (_err) {
    // ignore
  } finally {
    process.exit(code);
  }
};

mongoose.connection.once('connected', async () => {
  try {
    const result = await ensureAdminUser({ allowUpdate: force });
    if (result?.created) {
      console.log('Admin user created.');
    } else if (result?.updated) {
      console.log('Admin user updated.');
    } else if (result?.skipped) {
      console.log(`Admin bootstrap skipped (${result.reason || 'unknown reason'}).`);
    } else {
      console.log('Admin user already exists; nothing to do.');
    }
    await shutdown(0);
  } catch (err) {
    console.error('Failed to seed admin user:', err);
    await shutdown(1);
  }
});

mongoose.connection.on('error', async (err) => {
  console.error('MongoDB connection error:', err);
  await shutdown(1);
});
