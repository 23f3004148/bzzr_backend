const FormApiKey = require('../models/formApiKey');

const createKey = (payload) => FormApiKey.create(payload);

module.exports = {
  createKey,
};
