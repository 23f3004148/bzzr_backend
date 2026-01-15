const express = require('express');
const { authRequired, adminOnly } = require('../middleware/auth');
const User = require('../models/user');
const AdminSettings = require('../models/adminSettings');

const router = express.Router();
const resolveMinCreditPurchase = async () => {
  const settings = await AdminSettings.getConfig();
  const value = Number(settings?.minCreditPurchase);
  return Number.isFinite(value) && value > 0 ? value : 120;
};

// GET /api/wallet - return current user's wallet/credits
router.get('/', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('loginId email wallet avatarUrl name role active');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        id: user._id,
        loginId: user.loginId,
        email: user.email || null,
        name: user.name,
        role: user.role,
        active: user.active,
        avatarUrl: user.avatarUrl || '',
      },
      wallet: user.wallet || { aiInterviewCredits: 0, mentorSessionCredits: 0 },
    });
  } catch (err) {
    console.error('wallet get error', err);
    res.status(500).json({ error: 'Failed to load wallet' });
  }
});

// POST /api/wallet/purchase - DEVELOPMENT / DIRECT purchase endpoint.
// In production you should verify payments before crediting.
router.post('/purchase', authRequired, async (req, res) => {
  try {
    const { creditType, quantity } = req.body || {};
    const minCreditPurchase = await resolveMinCreditPurchase();
    const q = Number(quantity);
    if (!creditType || !['AI', 'MENTOR'].includes(String(creditType).toUpperCase())) {
      return res.status(400).json({ error: 'creditType must be AI or MENTOR' });
    }
    if (!Number.isFinite(q) || q < minCreditPurchase || q > 1000) {
      return res
        .status(400)
        .json({ error: `quantity must be ${minCreditPurchase}..1000` });
    }

    const inc = {};
    if (String(creditType).toUpperCase() === 'AI') {
      inc['wallet.aiInterviewCredits'] = q;
    } else {
      inc['wallet.mentorSessionCredits'] = q;
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: inc },
      { new: true, select: 'wallet' }
    );
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ wallet: updated.wallet || { aiInterviewCredits: 0, mentorSessionCredits: 0 } });
  } catch (err) {
    console.error('wallet purchase error', err);
    res.status(500).json({ error: 'Failed to purchase credits' });
  }
});

// Admin top-up endpoint (positive/negative deltas).
router.post('/topup', authRequired, adminOnly, async (req, res) => {
  try {
    const { identifier, aiInterviewCreditsDelta = 0, mentorSessionCreditsDelta = 0 } = req.body || {};
    const id = String(identifier || '').trim();
    if (!id) return res.status(400).json({ error: 'identifier required (email or loginId)' });
    const a = Number(aiInterviewCreditsDelta);
    const m = Number(mentorSessionCreditsDelta);
    if (!Number.isFinite(a) || !Number.isFinite(m)) {
      return res.status(400).json({ error: 'credit deltas must be numbers' });
    }

    const user = await User.findOne({ $or: [{ loginId: id }, { email: id.toLowerCase() }] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent negative balances.
    const nextAi = Math.max(0, Number(user.wallet?.aiInterviewCredits || 0) + a);
    const nextMentor = Math.max(0, Number(user.wallet?.mentorSessionCredits || 0) + m);

    user.wallet = { aiInterviewCredits: nextAi, mentorSessionCredits: nextMentor };
    await user.save();
    res.json({
      user: { id: user._id, loginId: user.loginId, email: user.email || null, name: user.name },
      wallet: user.wallet,
    });
  } catch (err) {
    console.error('wallet topup error', err);
    res.status(500).json({ error: 'Failed to top up wallet' });
  }
});

module.exports = router;
