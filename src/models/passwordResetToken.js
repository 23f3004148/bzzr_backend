const mongoose = require('mongoose');

// Stores password reset tokens for users. Each token is tied to a user and has an
// expiry timestamp. When a reset request is processed, the token record is
// consumed and deleted.

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);