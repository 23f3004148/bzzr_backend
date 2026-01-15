const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('../utils/env');
const { authRequired } = require('../middleware/auth');
const PaymentIntent = require('../models/paymentIntent');
const User = require('../models/user');
const AdminSettings = require('../models/adminSettings');
const PricingBundle = require('../models/pricingBundle');

const router = express.Router();
const resolveMinCreditPurchase = async () => {
  const settings = await AdminSettings.getConfig();
  const value = Number(settings?.minCreditPurchase);
  return Number.isFinite(value) && value > 0 ? value : 120;
};

const buildRazorpayReceipt = (userId) => {
  const prefix = 'wallet';
  const shortUser = String(userId || '').slice(-6);
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${shortUser}-${ts}-${rand}`;
};

const getRazorpayClient = async () => {
  const settings = await AdminSettings.getConfig();
  const key_id = settings.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
  const key_secret = settings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      'Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env or set them in Admin > Settings.'
    );
  }
  return new Razorpay({ key_id, key_secret });
};

const getCreditPrice = async (creditType) => {
  const settings = await AdminSettings.getConfig();
  if (creditType === 'AI') return settings.aiCreditPrice || 5;
  return settings.mentorCreditPrice || 15;
};

const isOfferActive = (bundle) => {
  const hasOffer =
    Number(bundle.offerDiscountPercent || 0) > 0 ||
    Number(bundle.offerBonusCredits || 0) > 0;
  if (!hasOffer) return false;
  const now = Date.now();
  const start = bundle.offerStart ? Date.parse(bundle.offerStart) : null;
  const end = bundle.offerEnd ? Date.parse(bundle.offerEnd) : null;
  if (start && Number.isFinite(start) && now < start) return false;
  if (end && Number.isFinite(end) && now > end) return false;
  return true;
};

const resolveBundleOffer = (bundle) => {
  const offerActive = isOfferActive(bundle);
  const basePrice = Number(bundle.priceInr || 0);
  const discountPercent = offerActive ? Number(bundle.offerDiscountPercent || 0) : 0;
  const effectivePrice =
    discountPercent > 0
      ? Math.max(0, Math.round(basePrice * (1 - discountPercent / 100)))
      : basePrice;
  const offerBonus = offerActive ? Number(bundle.offerBonusCredits || 0) : 0;
  const totalCredits =
    Number(bundle.credits || 0) + Number(bundle.bonusCredits || 0) + offerBonus;
  const badge = offerActive
    ? bundle.offerBadge || (discountPercent > 0 ? `Save ${discountPercent}%` : `+${offerBonus} credits`)
    : bundle.tag || '';
  return { offerActive, effectivePrice, discountPercent, offerBonus, totalCredits, badge };
};

router.post('/razorpay/order', authRequired, async (req, res) => {
  try {
    const { creditType, quantity } = req.body || {};
    const credit = String(creditType || '').toUpperCase();
    const qty = Number(quantity) || 1;
    if (!['AI', 'MENTOR'].includes(credit)) {
      return res.status(400).json({ error: 'creditType must be AI or MENTOR' });
    }
    const minCreditPurchase = await resolveMinCreditPurchase();
    if (!Number.isFinite(qty) || qty < minCreditPurchase || qty > 1000) {
      return res
        .status(400)
        .json({ error: `quantity must be ${minCreditPurchase}..1000` });
    }

    const pricePer = await getCreditPrice(credit);
    const amount = Math.round(pricePer * 100 * qty); // in paise

    const razorpay = await getRazorpayClient();
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: buildRazorpayReceipt(req.user.id),
      notes: { creditType: credit, quantity: qty, userId: req.user.id.toString() },
    });

    await PaymentIntent.create({
      userId: req.user.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      creditType: credit,
      quantity: qty,
      status: 'created',
    });

    res.json({ order, keyId: razorpay.key_id || (await AdminSettings.getConfig()).razorpayKeyId });
  } catch (err) {
    console.error('razorpay order error', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

router.post('/razorpay/bundle-order', authRequired, async (req, res) => {
  try {
    const { bundleId } = req.body || {};
    if (!bundleId) {
      return res.status(400).json({ error: 'bundleId is required' });
    }

    const bundle = await PricingBundle.findById(bundleId);
    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const { effectivePrice, totalCredits, discountPercent, offerBonus, badge } = resolveBundleOffer(bundle);
    if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
      return res.status(400).json({ error: 'Bundle price must be greater than zero' });
    }
    if (!Number.isFinite(totalCredits) || totalCredits <= 0) {
      return res.status(400).json({ error: 'Bundle credits must be greater than zero' });
    }
    if (totalCredits < MIN_CREDIT_PURCHASE) {
      return res
        .status(400)
        .json({ error: `Bundle credits must be at least ${MIN_CREDIT_PURCHASE}` });
    }

    const amount = Math.round(effectivePrice * 100);
    const razorpay = await getRazorpayClient();
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: buildRazorpayReceipt(req.user.id),
      notes: {
        bundleId: bundle._id.toString(),
        bundleName: bundle.name,
        credits: totalCredits,
        userId: req.user.id.toString(),
      },
    });

    await PaymentIntent.create({
      userId: req.user.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      creditType: 'AI',
      quantity: totalCredits,
      status: 'created',
      purchaseType: 'bundle',
      bundleId: bundle._id.toString(),
      bundleName: bundle.name,
      bundleCredits: Number(bundle.credits || 0),
      bundleBonusCredits: Number(bundle.bonusCredits || 0),
      bundleOfferDiscountPercent: Number(discountPercent || 0),
      bundleOfferBonusCredits: Number(offerBonus || 0),
      bundlePriceInr: Number(bundle.priceInr || 0),
      bundleFinalPriceInr: Number(effectivePrice || 0),
      bundleOfferBadge: badge || '',
    });

    res.json({
      order,
      keyId: razorpay.key_id || (await AdminSettings.getConfig()).razorpayKeyId,
      credits: totalCredits,
    });
  } catch (err) {
    console.error('razorpay bundle order error', err);
    res.status(500).json({ error: err.message || 'Failed to create bundle order' });
  }
});

router.post('/razorpay/verify', authRequired, async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body || {};
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'orderId, paymentId, signature required' });
    }

    const settings = await AdminSettings.getConfig();
    const key_secret = settings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return res.status(500).json({ error: 'Razorpay keys not configured' });
    }

    const hmac = crypto.createHmac('sha256', key_secret);
    hmac.update(`${orderId}|${paymentId}`);
    const expected = hmac.digest('hex');
    if (expected !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const intent = await PaymentIntent.findOne({ orderId });
    if (!intent) return res.status(404).json({ error: 'Order not found' });
    if (intent.status === 'paid') return res.json({ walletCredited: false, status: 'already_paid' });

    // credit wallet
    const user = await User.findById(intent.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const aiCredits = Number(user.wallet?.aiInterviewCredits || 0);
    const mentorCredits = Number(user.wallet?.mentorSessionCredits || 0);
    if (intent.creditType === 'AI') {
      user.wallet.aiInterviewCredits = aiCredits + intent.quantity;
    } else {
      user.wallet.mentorSessionCredits = mentorCredits + intent.quantity;
    }
    await user.save();

    intent.status = 'paid';
    intent.razorpayPaymentId = paymentId;
    intent.razorpaySignature = signature;
    await intent.save();

    res.json({ wallet: user.wallet, status: 'credited' });
  } catch (err) {
    console.error('razorpay verify error', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;

// Payment history endpoints
// Get payment history for current user
router.get('/history', authRequired, async (req, res) => {
  try {
    // Find all payment intents for this user, sorted by creation date descending
    const history = await PaymentIntent.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ history });
  } catch (err) {
    console.error('payment history error', err);
    return res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Get payment history for admin (all users). Admin only.
router.get('/admin/history', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    // Fetch all payment intents
    const intents = await PaymentIntent.find().sort({ createdAt: -1 }).lean();
    // Collect unique user IDs
    const userIds = Array.from(new Set(intents.map((i) => String(i.userId))));
    // Fetch user info (loginId, email, name) for those users
    const users = await User.find({ _id: { $in: userIds } }, { loginId: 1, email: 1, name: 1 }).lean();
    const userMap = {};
    users.forEach((u) => {
      userMap[String(u._id)] = u;
    });
    // Attach user info to each intent
    const history = intents.map((i) => {
      const u = userMap[String(i.userId)] || null;
      return {
        ...i,
        user: u
          ? {
              id: u._id,
              loginId: u.loginId || '',
              email: u.email || '',
              name: u.name || '',
            }
          : null,
      };
    });
    return res.json({ history });
  } catch (err) {
    console.error('admin payment history error', err);
    return res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});
