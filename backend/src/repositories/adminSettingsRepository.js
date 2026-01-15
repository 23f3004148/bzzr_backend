const AdminSettings = require('../models/adminSettings');

const getConfig = () => AdminSettings.getConfig();

module.exports = {
  getConfig,
};
