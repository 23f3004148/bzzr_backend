const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema(
  {
    defaultProvider: {
      type: String,
      enum: ['openai', 'gemini', 'deepseek'],
      default: 'openai'
    },
    openaiModel: {
      type: String,
      default: 'gpt-4.1-mini'
    },
    geminiModel: {
      type: String,
      default: 'gemini-2.0-flash'
    },
    deepseekModel: {
      type: String,
      default: 'deepseek-chat'
    },
    openaiApiKey: { type: String },
    geminiApiKey: { type: String },
    deepseekApiKey: { type: String },
    deepgramApiKey: { type: String },
    /*
     * Support contact number that is displayed on the landing page.
     * Updated through the admin panel so users always see the current value.
     */
    supportPhone: { type: String, default: '4567892345' },

    // Credit pricing (INR) for AI and Mentor credits
    aiCreditPrice: { type: Number, default: 5 },
    mentorCreditPrice: { type: Number, default: 15 },
    minCreditPurchase: { type: Number, default: 120 },

    // Razorpay keys for checkout-based payments
    razorpayKeyId: { type: String },
    razorpayKeySecret: { type: String },

    // Public-facing site configuration
    instagramUrl: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    youtubeUrl: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    footerTagline: { type: String, default: 'BUUZZER interview copilot' },

    // Free trial credit defaults
    freeTrialAiCredits: { type: Number, default: 25 },
    freeTrialMentorCredits: { type: Number, default: 0 },

    // Session billing controls
    sessionGraceMinutes: { type: Number, default: 3 },
    sessionHardStopEnabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

adminSettingsSchema.statics.getConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
