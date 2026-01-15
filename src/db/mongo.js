const mongoose = require('mongoose');
require('../utils/env');

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('[MongoDB] MONGO_URI is missing in backend/.env');
  // In production, fail fast to avoid running without a database.
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    process.exit(1);
  }
}

mongoose.set('strictQuery', false);

const connectWithRetry = () => {
  if (!uri) return;
  console.log('MongoDB: Attempting to connect...');
  mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 5000, // Fail fast to retry
      socketTimeoutMS: 45000,
      autoIndex: true,
    })
    .then(() => {
      console.log('[MongoDB] Connected');
    })
    .catch((err) => {
      console.error('[MongoDB] Connection error:', err.message);
      console.log('Retrying in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

mongoose.connection.on('error', (err) => {
  console.error('MongoDB runtime error:', err);
});

module.exports = mongoose;
