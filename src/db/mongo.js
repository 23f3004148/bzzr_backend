const mongoose = require('mongoose');
require('../utils/env');

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('❌ MONGO_URI is missing in backend/.env');
  // We don't exit here, just warn, so the app doesn't crash loop immediately if env is malformed
}

mongoose.set('strictQuery', false);

const connectWithRetry = () => {
  console.log('MongoDB: Attempting to connect...');
  mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 5000, // Fail fast to retry
      socketTimeoutMS: 45000,
    })
    .then(() => {
      console.log('✅ MongoDB Atlas connected');
    })
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err.message);
      console.log('Retrying in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

mongoose.connection.on('error', (err) => {
  console.error('MongoDB runtime error:', err);
});

module.exports = mongoose;
