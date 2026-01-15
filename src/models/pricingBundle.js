const mongoose = require('mongoose');

const pricingBundleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    priceInr: { type: Number, required: true },
    credits: { type: Number, required: true }, // base credits delivered
    bonusCredits: { type: Number, default: 0 },
    description: { type: String, default: '' },
    features: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    tag: { type: String, default: '' }, // e.g., "Most Popular"
    displayOrder: { type: Number, default: 0 },
    showOnLanding: { type: Boolean, default: true },

    // Offer window (optional)
    offerDiscountPercent: { type: Number, default: 0 },
    offerBonusCredits: { type: Number, default: 0 },
    offerStart: { type: Date },
    offerEnd: { type: Date },
    offerBadge: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PricingBundle', pricingBundleSchema);
