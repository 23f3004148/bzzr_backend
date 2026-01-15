const AdminSettings = require('../models/adminSettings');

const CACHE_TTL_MS = 5 * 1000;

let cachedConfig = null;
let cacheTime = 0;

const fetchFreshConfig = async () => {
  const config = await AdminSettings.getConfig();
  cachedConfig = config;
  cacheTime = Date.now();
  return config;
};

const getCachedConfig = async () => {
  const now = Date.now();
  if (!cachedConfig || now - cacheTime > CACHE_TTL_MS) {
    return fetchFreshConfig();
  }
  return cachedConfig;
};

const invalidateAdminConfigCache = () => {
  cachedConfig = null;
  cacheTime = 0;
};

module.exports = {
  getCachedConfig,
  invalidateAdminConfigCache,
};
