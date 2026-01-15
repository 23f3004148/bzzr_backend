const mongoose = require('mongoose');

const paymentIntentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true }, // in paise
    currency: { type: String, default: 'INR' },
    creditType: { type: String, enum: ['AI', 'MENTOR'], required: true },
    quantity: { type: Number, required: true },
    purchaseType: { type: String, enum: ['credits', 'bundle'], default: 'credits' },
    bundleId: { type: String },
    bundleName: { type: String },
    bundleCredits: { type: Number },
    bundleBonusCredits: { type: Number },
    bundleOfferDiscountPercent: { type: Number },
    bundleOfferBonusCredits: { type: Number },
    bundlePriceInr: { type: Number },
    bundleFinalPriceInr: { type: Number },
    bundleOfferBadge: { type: String },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
    },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentIntent', paymentIntentSchema);
