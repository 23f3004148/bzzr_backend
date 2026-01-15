const ServiceError = require('../errors/serviceError');

const handleServiceError = (res, err, fallbackMessage) => {
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: fallbackMessage });
};

module.exports = { handleServiceError };
