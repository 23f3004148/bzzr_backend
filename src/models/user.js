const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // System-generated public user ID (alphanumeric) used for login and sharing.
    // Users can also login using email.
    loginId: { type: String, required: true, unique: true, index: true },

    // Email-based login (required for new public registrations, optional for legacy/admin).
    email: { type: String, unique: true, sparse: true, index: true },

    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user', 'mentor'], required: true },
    active: { type: Boolean, default: true },

    // Wallet / credits
    wallet: {
      aiInterviewCredits: { type: Number, default: 0 },
      mentorSessionCredits: { type: Number, default: 0 },
    },

    // Optional avatar image url (served by backend static uploads)
    avatarUrl: { type: String, default: '' },

    // Optional user dashboard profile fields (used by the Chrome extension sync)
    // Resume is typically static for a user; JD/company info is per-interview/session.
    resumeText: { type: String, default: '' },
    keywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
